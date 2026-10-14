"""Per-session VCF store backed by on-disk SQLite.

On load, the VCF is stream-parsed and written row-by-row into a session SQLite
table. Nothing but small fixed-size batches is ever held in RAM, so memory stays
flat regardless of file size. The table then gives:
  * O(1) paginated reads for the variant table (LIMIT/OFFSET on the primary key),
  * a natural join/lookup target for Phase 2 annotation,
  * a streamable source for Phase 4 scoring.
"""
from __future__ import annotations

import os
import sqlite3
import time
from typing import Iterator, Optional

from ..config import SUMMARY_PREVIEW_ROWS
from ..models import Variant, VcfSummary
from .parser import iter_records, open_text, read_header

_CREATE = """
CREATE TABLE variants (
    row       INTEGER PRIMARY KEY,
    id        TEXT NOT NULL,
    chrom     TEXT NOT NULL,
    pos       INTEGER NOT NULL,
    ref       TEXT NOT NULL,
    alt       TEXT NOT NULL,
    qual      REAL,
    filter    TEXT,
    genotype  TEXT,
    zygosity  TEXT
);
"""

_COLS = "row, id, chrom, pos, ref, alt, qual, filter, genotype, zygosity"
_BATCH = 5000


def _row_to_variant(r: sqlite3.Row | tuple) -> Variant:
    return Variant(
        row=r[0],
        id=r[1],
        chrom=r[2],
        pos=r[3],
        ref=r[4],
        alt=r[5],
        qual=r[6],
        filter=r[7] if r[7] is not None else ".",
        genotype=r[8],
        zygosity=r[9],
    )


class VcfSession:
    """Owns one loaded VCF as a session SQLite DB."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self.summary: Optional[VcfSummary] = None

    # ---- loading -----------------------------------------------------------
    def load(self, path: str) -> VcfSummary:
        if not os.path.isfile(path):
            raise FileNotFoundError(path)

        t0 = time.perf_counter()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

        con = sqlite3.connect(self.db_path)
        try:
            # Session DB is disposable scratch — durability not needed; favour speed.
            con.execute("PRAGMA journal_mode=OFF")
            con.execute("PRAGMA synchronous=OFF")
            con.execute("PRAGMA temp_store=MEMORY")
            con.executescript(_CREATE)

            fh = open_text(path)
            try:
                header, first = read_header(fh)
                total = 0
                multi = 0
                batch: list[tuple] = []
                insert = f"INSERT INTO variants ({_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)"
                for rec in iter_records(fh, first):
                    total += 1
                    if rec.from_multiallelic:
                        multi += 1
                    vid = f"{rec.chrom}:{rec.pos}:{rec.ref}:{rec.alt}"
                    batch.append(
                        (
                            total,
                            vid,
                            rec.chrom,
                            rec.pos,
                            rec.ref,
                            rec.alt,
                            rec.qual,
                            rec.filter,
                            rec.genotype,
                            rec.zygosity,
                        )
                    )
                    if len(batch) >= _BATCH:
                        con.executemany(insert, batch)
                        batch.clear()
                if batch:
                    con.executemany(insert, batch)
            finally:
                fh.close()
            con.commit()

            first_variants = [
                _row_to_variant(r)
                for r in con.execute(
                    f"SELECT {_COLS} FROM variants ORDER BY row LIMIT ?",
                    (SUMMARY_PREVIEW_ROWS,),
                )
            ]
        finally:
            con.close()

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        summary = VcfSummary(
            file_path=path,
            total_variants=total,
            samples=header.samples,
            sample_name=header.samples[0] if header.samples else None,
            fileformat=header.fileformat,
            reference=header.reference,
            parse_time_ms=round(elapsed_ms, 2),
            multiallelic_records=multi,
            first_variants=first_variants,
        )
        self.summary = summary
        return summary

    # ---- reads -------------------------------------------------------------
    def _connect_ro(self) -> sqlite3.Connection:
        return sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)

    def page(self, offset: int, limit: int) -> list[Variant]:
        con = self._connect_ro()
        try:
            rows = con.execute(
                f"SELECT {_COLS} FROM variants ORDER BY row LIMIT ? OFFSET ?",
                (limit, offset),
            )
            return [_row_to_variant(r) for r in rows]
        finally:
            con.close()

    def total(self) -> int:
        con = self._connect_ro()
        try:
            return con.execute("SELECT COUNT(*) FROM variants").fetchone()[0]
        finally:
            con.close()

    def iter_all(self) -> Iterator[Variant]:
        """Stream every variant (used by scoring). Server-side cursor keeps
        memory flat for million-row VCFs."""
        con = self._connect_ro()
        try:
            for r in con.execute(f"SELECT {_COLS} FROM variants ORDER BY row"):
                yield _row_to_variant(r)
        finally:
            con.close()
