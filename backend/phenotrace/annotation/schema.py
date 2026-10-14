"""Annotation database schema + a generic builder.

One combined SQLite file holds four locus-keyed tables plus a `meta` table that
records per-source provenance (version, snapshot date, row count, and whether the
data is sample/development data). Both the offline real builder
(`tools/db-builder/build_db.py`) and the bundled sample builder (`sample_db.py`)
go through `build_database` so the on-disk shape is identical.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Iterable, Sequence

GNOMAD_COLS = ("chrom", "pos", "ref", "alt", "af", "popmax_af")
CLINVAR_COLS = ("chrom", "pos", "ref", "alt", "clnsig", "clnrevstat", "gene")
PATHO_COLS = ("chrom", "pos", "ref", "alt", "score", "source")
GENEMAP_COLS = ("chrom", "pos", "ref", "alt", "gene", "consequence", "consequence_rank")

DATA_TABLES = ("gnomad", "clinvar", "pathogenicity", "gene_map")

_CREATE = {
    "gnomad": "CREATE TABLE gnomad (chrom TEXT, pos INTEGER, ref TEXT, alt TEXT, af REAL, popmax_af REAL)",
    "clinvar": "CREATE TABLE clinvar (chrom TEXT, pos INTEGER, ref TEXT, alt TEXT, clnsig TEXT, clnrevstat TEXT, gene TEXT)",
    "pathogenicity": "CREATE TABLE pathogenicity (chrom TEXT, pos INTEGER, ref TEXT, alt TEXT, score REAL, source TEXT)",
    "gene_map": "CREATE TABLE gene_map (chrom TEXT, pos INTEGER, ref TEXT, alt TEXT, gene TEXT, consequence TEXT, consequence_rank INTEGER)",
    "meta": (
        "CREATE TABLE meta (source TEXT PRIMARY KEY, version TEXT, "
        "snapshot_date TEXT, row_count INTEGER, is_sample INTEGER DEFAULT 0)"
    ),
}

_COLS = {
    "gnomad": GNOMAD_COLS,
    "clinvar": CLINVAR_COLS,
    "pathogenicity": PATHO_COLS,
    "gene_map": GENEMAP_COLS,
}


def canon_chrom(c: str) -> str:
    """Normalize chromosome naming so 'chr1' and '1' match across VCF and DBs."""
    return c[3:] if c[:3].lower() == "chr" else c


def _canon_row(row: Sequence) -> tuple:
    r = list(row)
    r[0] = canon_chrom(str(r[0]))
    return tuple(r)


def build_database(
    path: str,
    *,
    gnomad: Iterable[Sequence] = (),
    clinvar: Iterable[Sequence] = (),
    pathogenicity: Iterable[Sequence] = (),
    gene_map: Iterable[Sequence] = (),
    meta: dict[str, dict] | None = None,
) -> dict[str, int]:
    """Create the annotation DB at `path`. Returns per-table row counts.

    `meta` maps source -> {version, snapshot_date, is_sample}. Row counts are
    computed here and written into the meta table.
    """
    meta = meta or {}
    if os.path.exists(path):
        os.remove(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    con = sqlite3.connect(path)
    counts: dict[str, int] = {}
    try:
        con.execute("PRAGMA journal_mode=OFF")
        con.execute("PRAGMA synchronous=OFF")
        for stmt in _CREATE.values():
            con.execute(stmt)

        for table, rows in (
            ("gnomad", gnomad),
            ("clinvar", clinvar),
            ("pathogenicity", pathogenicity),
            ("gene_map", gene_map),
        ):
            cols = _COLS[table]
            placeholders = ",".join("?" * len(cols))
            data = [_canon_row(r) for r in rows]
            con.executemany(
                f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})", data
            )
            counts[table] = len(data)

        for source in DATA_TABLES:
            m = meta.get(source, {})
            con.execute(
                "INSERT OR REPLACE INTO meta (source, version, snapshot_date, row_count, is_sample) "
                "VALUES (?,?,?,?,?)",
                (
                    source,
                    m.get("version"),
                    m.get("snapshot_date"),
                    counts.get(source, 0),
                    1 if m.get("is_sample") else 0,
                ),
            )

        for table in DATA_TABLES:
            con.execute(f"CREATE INDEX idx_{table}_locus ON {table}(chrom, pos, ref, alt)")
        con.execute("ANALYZE")
        con.commit()
    finally:
        con.close()
    return counts
