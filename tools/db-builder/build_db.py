#!/usr/bin/env python
"""Offline annotation-database builder (build-time / first-run tool — NOT runtime).

Turns frozen-snapshot source files into PhenoTrace's combined ``annotations.sqlite``.
Runs fully offline; you download the sources yourself (see SOURCES.md) and point
this at them.

Example:
    python tools/db-builder/build_db.py \\
        --clinvar  ~/dbs/clinvar.vcf.gz \\
        --gnomad   ~/dbs/gnomad.exomes.sites.chr1.vcf.bgz \\
        --cadd     ~/dbs/whole_genome_SNVs.tsv.gz \\
        --gene-map ~/dbs/gene_map.tsv \\
        --clinvar-date 2024-05-01 --gnomad-date 2023-11-01 \\
        --out ~/.local/share/PhenoTrace/databases/annotations.sqlite

Omit any source to leave that table empty. Indexes + ANALYZE are always run.
"""
from __future__ import annotations

import argparse
import os
import sys

# Make the backend package importable when run from the repo.
_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(_REPO, "backend"))

from phenotrace.annotation.sources import build_from_sources  # noqa: E402
from phenotrace.config import annotation_db_path  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Build PhenoTrace annotation DB from snapshots.")
    ap.add_argument("--clinvar", help="ClinVar VCF (.vcf or .vcf.gz)")
    ap.add_argument("--gnomad", help="gnomAD sites VCF (.vcf/.bgz)")
    ap.add_argument("--cadd", help="CADD whole-genome TSV (.tsv.gz)")
    ap.add_argument("--gene-map", dest="gene_map", help="Precomputed gene-map TSV")
    ap.add_argument("--clinvar-date", default=None)
    ap.add_argument("--gnomad-date", default=None)
    ap.add_argument("--cadd-date", default=None)
    ap.add_argument("--gene-map-date", dest="gene_map_date", default=None)
    ap.add_argument("--out", default=None, help="Output DB path (default: app-data dir)")
    args = ap.parse_args()

    if not any([args.clinvar, args.gnomad, args.cadd, args.gene_map]):
        ap.error("provide at least one source (--clinvar/--gnomad/--cadd/--gene-map)")

    out = args.out or str(annotation_db_path())
    meta = {
        "clinvar": {"version": "clinvar", "snapshot_date": args.clinvar_date, "is_sample": False},
        "gnomad": {"version": "gnomad", "snapshot_date": args.gnomad_date, "is_sample": False},
        "pathogenicity": {"version": "CADD", "snapshot_date": args.cadd_date, "is_sample": False},
        "gene_map": {"version": "gene_map", "snapshot_date": args.gene_map_date, "is_sample": False},
    }

    print(f"Building {out} ...")
    counts = build_from_sources(
        out,
        clinvar=args.clinvar,
        gnomad=args.gnomad,
        cadd=args.cadd,
        gene_map_tsv=args.gene_map,
        meta=meta,
    )
    for table, n in counts.items():
        print(f"  {table:14s} {n:>12,} rows")
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
