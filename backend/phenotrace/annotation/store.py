"""Read-only, indexed annotation lookups against the local SQLite DB.

Opened read-only with memory-mapping enabled. Lookups are point queries on the
locus index, batched within a single connection. A helper also exposes the raw
connection so Phase 4 scoring can ATTACH and JOIN for whole-VCF passes.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Iterable

from ..config import annotation_db_path
from ..models import Annotation, DbMeta, Variant
from .schema import DATA_TABLES, canon_chrom

_MMAP_BYTES = 256 * 1024 * 1024  # 256 MiB


class LiteVariant:
    """Lightweight, validation-free variant for the scoring hot loop. Same
    attribute names as models.Variant so scoring factors duck-type over it."""

    __slots__ = ("id", "row", "chrom", "pos", "ref", "alt", "qual", "filter", "genotype", "zygosity")

    def __init__(self, r) -> None:
        self.row, self.id, self.chrom, self.pos, self.ref, self.alt = r[0], r[1], r[2], r[3], r[4], r[5]
        self.qual, self.filter, self.genotype, self.zygosity = r[6], r[7], r[8], r[9]


class LiteAnnotation:
    """Lightweight, validation-free annotation for the scoring hot loop."""

    __slots__ = (
        "variant_id", "af", "popmax_af", "clnsig", "clnrevstat",
        "gene", "consequence", "consequence_rank", "pathogenicity_score", "pathogenicity_source",
    )

    def __init__(self, variant_id: str) -> None:
        self.variant_id = variant_id
        self.af = self.popmax_af = self.clnsig = self.clnrevstat = None
        self.gene = self.consequence = self.consequence_rank = None
        self.pathogenicity_score = self.pathogenicity_source = None


def open_ro(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.execute(f"PRAGMA mmap_size={_MMAP_BYTES}")
    con.execute("PRAGMA query_only=ON")
    return con


def parse_variant_id(vid: str) -> tuple[str, int, str, str] | None:
    """'chrom:pos:ref:alt' -> (chrom, pos, ref, alt). None if malformed."""
    parts = vid.split(":")
    if len(parts) != 4:
        return None
    chrom, pos, ref, alt = parts
    try:
        return chrom, int(pos), ref, alt
    except ValueError:
        return None


class AnnotationStore:
    def __init__(self, path: str | None = None) -> None:
        self.path = str(path or annotation_db_path())

    def available(self) -> bool:
        return os.path.exists(self.path)

    # ---- lookups -----------------------------------------------------------
    def _annotate_on(self, con: sqlite3.Connection, vid: str, chrom: str, pos: int, ref: str, alt: str) -> Annotation:
        key = (canon_chrom(chrom), pos, ref, alt)
        ann = Annotation(variant_id=vid)

        row = con.execute(
            "SELECT af, popmax_af FROM gnomad WHERE chrom=? AND pos=? AND ref=? AND alt=?", key
        ).fetchone()
        if row:
            ann.af, ann.popmax_af = row[0], row[1]

        cv_gene = None
        row = con.execute(
            "SELECT clnsig, clnrevstat, gene FROM clinvar WHERE chrom=? AND pos=? AND ref=? AND alt=?",
            key,
        ).fetchone()
        if row:
            ann.clnsig, ann.clnrevstat, cv_gene = row[0], row[1], row[2]

        row = con.execute(
            "SELECT score, source FROM pathogenicity WHERE chrom=? AND pos=? AND ref=? AND alt=?",
            key,
        ).fetchone()
        if row:
            ann.pathogenicity_score, ann.pathogenicity_source = row[0], row[1]

        row = con.execute(
            "SELECT gene, consequence, consequence_rank FROM gene_map WHERE chrom=? AND pos=? AND ref=? AND alt=?",
            key,
        ).fetchone()
        if row:
            ann.gene, ann.consequence, ann.consequence_rank = row[0], row[1], row[2]

        if not ann.gene and cv_gene:
            ann.gene = cv_gene
        return ann

    def annotate_variants(self, variants: Iterable[Variant]) -> list[Annotation]:
        variants = list(variants)
        if not self.available():
            return [Annotation(variant_id=v.id) for v in variants]
        con = open_ro(self.path)
        try:
            return [
                self._annotate_on(con, v.id, v.chrom, v.pos, v.ref, v.alt) for v in variants
            ]
        finally:
            con.close()

    def annotate_ids(self, ids: Iterable[str]) -> list[Annotation]:
        ids = list(ids)
        if not self.available():
            return [Annotation(variant_id=i) for i in ids]
        con = open_ro(self.path)
        try:
            out: list[Annotation] = []
            for vid in ids:
                parsed = parse_variant_id(vid)
                if parsed is None:
                    out.append(Annotation(variant_id=vid))
                    continue
                chrom, pos, ref, alt = parsed
                out.append(self._annotate_on(con, vid, chrom, pos, ref, alt))
            return out
        finally:
            con.close()

    # ---- provenance --------------------------------------------------------
    def db_status(self) -> list[DbMeta]:
        if not self.available():
            return [DbMeta(source=s, present=False) for s in DATA_TABLES]
        con = open_ro(self.path)
        try:
            rows = {
                r[0]: r
                for r in con.execute(
                    "SELECT source, version, snapshot_date, row_count, is_sample FROM meta"
                )
            }
        finally:
            con.close()
        out: list[DbMeta] = []
        for s in DATA_TABLES:
            r = rows.get(s)
            if r is None:
                out.append(DbMeta(source=s, present=False, path=self.path))
            else:
                version = r[1]
                if r[4]:  # is_sample
                    version = f"{version} (SAMPLE DATA)"
                out.append(
                    DbMeta(
                        source=s,
                        present=True,
                        version=version,
                        snapshot_date=r[2],
                        row_count=r[3],
                        path=self.path,
                    )
                )
        return out

    # ---- whole-VCF join (scoring path) ------------------------------------
    def iter_annotated(self, session_db_path: str):
        """Stream (LiteVariant, LiteAnnotation) for every variant in the session DB.

        When annotation data is present it is joined in a single indexed query
        (ATTACH + LEFT JOINs) — far faster than per-variant lookups for large
        VCFs, and memory stays flat via the server-side cursor. Lightweight
        ``__slots__`` objects (no pydantic validation) keep the hot loop fast.
        The chr-prefix is normalized in SQL so 'chr2'/'2' match.
        """
        from ..vcf.store import _COLS

        con = sqlite3.connect(f"file:{session_db_path}?mode=ro", uri=True)
        try:
            con.execute(f"PRAGMA mmap_size={_MMAP_BYTES}")
            if not self.available():
                for r in con.execute(f"SELECT {_COLS} FROM variants ORDER BY row"):
                    yield LiteVariant(r), LiteAnnotation(r[1])
                return

            con.execute("ATTACH DATABASE ? AS ann", (f"file:{self.path}?mode=ro",))
            sql = """
            WITH vv AS (
                SELECT *, CASE WHEN lower(substr(chrom,1,3))='chr'
                               THEN substr(chrom,4) ELSE chrom END AS ck
                FROM variants
            )
            SELECT v.row, v.id, v.chrom, v.pos, v.ref, v.alt, v.qual, v.filter,
                   v.genotype, v.zygosity,
                   g.af, g.popmax_af,
                   c.clnsig, c.clnrevstat, c.gene,
                   p.score, p.source,
                   m.gene, m.consequence, m.consequence_rank
            FROM vv v
            LEFT JOIN ann.gnomad        g ON g.chrom=v.ck AND g.pos=v.pos AND g.ref=v.ref AND g.alt=v.alt
            LEFT JOIN ann.clinvar       c ON c.chrom=v.ck AND c.pos=v.pos AND c.ref=v.ref AND c.alt=v.alt
            LEFT JOIN ann.pathogenicity p ON p.chrom=v.ck AND p.pos=v.pos AND p.ref=v.ref AND p.alt=v.alt
            LEFT JOIN ann.gene_map      m ON m.chrom=v.ck AND m.pos=v.pos AND m.ref=v.ref AND m.alt=v.alt
            ORDER BY v.row
            """
            for r in con.execute(sql):
                lv = LiteVariant(r)
                la = LiteAnnotation(r[1])
                la.af, la.popmax_af = r[10], r[11]
                la.clnsig, la.clnrevstat = r[12], r[13]
                la.pathogenicity_score, la.pathogenicity_source = r[15], r[16]
                la.gene = r[17] if r[17] is not None else r[14]
                la.consequence, la.consequence_rank = r[18], r[19]
                yield lv, la
        finally:
            con.close()

    def is_sample(self) -> bool:
        if not self.available():
            return False
        con = open_ro(self.path)
        try:
            row = con.execute("SELECT MAX(is_sample) FROM meta").fetchone()
            return bool(row and row[0])
        finally:
            con.close()
