#!/usr/bin/env python
"""Build the bundled SAMPLE annotation DB (offline, no network).

This produces clearly-labeled development data that aligns with
``fixtures/sample.vcf`` so the app and tests run out-of-the-box. For real data,
use ``build_db.py`` with downloaded snapshots (see SOURCES.md).

    python tools/db-builder/make_sample_dbs.py            # -> app-data dir
    python tools/db-builder/make_sample_dbs.py --out a.sqlite
"""
from __future__ import annotations

import argparse
import os
import sys

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(_REPO, "backend"))

from phenotrace.annotation.sample_db import build_sample_db  # noqa: E402
from phenotrace.config import annotation_db_path  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the bundled SAMPLE annotation DB.")
    ap.add_argument("--out", default=None, help="Output path (default: app-data dir)")
    args = ap.parse_args()
    out = args.out or str(annotation_db_path())
    counts = build_sample_db(out)
    print(f"Wrote SAMPLE annotation DB to {out}")
    for table, n in counts.items():
        print(f"  {table:14s} {n:>6,} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
