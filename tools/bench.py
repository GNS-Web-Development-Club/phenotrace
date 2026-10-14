#!/usr/bin/env python
"""Performance / memory benchmark.

Generates a large synthetic VCF, then times streaming ingest and whole-VCF scoring
while tracking peak Python memory — demonstrating that memory stays flat
regardless of variant count (streaming parse -> on-disk SQLite, server-side
cursor scoring, bounded top-N heap).

    python tools/bench.py            # 200k variants
    python tools/bench.py 1000000    # 1M variants
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
import tracemalloc

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(_REPO, "backend"))

from phenotrace.annotation.sample_db import build_sample_db  # noqa: E402
from phenotrace.annotation.store import AnnotationStore  # noqa: E402
from phenotrace.hpo.vocabulary import HpoVocabulary  # noqa: E402
from phenotrace.models import PhenotypeQuery, PreFilter, Weights  # noqa: E402
from phenotrace.scoring.engine import rank_variants  # noqa: E402
from phenotrace.vcf.store import VcfSession  # noqa: E402

_BASES = "ACGT"


def gen_vcf(path: str, n: int) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write("##fileformat=VCFv4.2\n##reference=GRCh38\n")
        f.write("#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\n")
        for i in range(n):
            chrom = f"chr{(i % 22) + 1}"
            pos = 10000 + i * 7
            ref = _BASES[i % 4]
            alt = _BASES[(i + 1) % 4]
            gt = "0/1" if i % 2 else "1/1"
            f.write(f"{chrom}\t{pos}\t.\t{ref}\t{alt}\t100\tPASS\t.\tGT\t{gt}\n")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    n = int(args[0]) if args else 200_000
    # tracemalloc traces every allocation and dominates wall-clock; opt in with --mem.
    measure_mem = "--mem" in sys.argv
    tmp = tempfile.mkdtemp(prefix="phenotrace_bench_")
    vcf = os.path.join(tmp, "big.vcf")

    print(f"Generating {n:,} variants...")
    t = time.perf_counter()
    gen_vcf(vcf, n)
    print(f"  generated in {time.perf_counter() - t:.2f}s "
          f"({os.path.getsize(vcf) / 1e6:.0f} MB on disk)")

    if measure_mem:
        tracemalloc.start()

    sess = VcfSession(os.path.join(tmp, "s.sqlite"))
    t = time.perf_counter()
    summary = sess.load(vcf)
    load_ms = (time.perf_counter() - t) * 1000
    mem_load = f"  peak-python {tracemalloc.get_traced_memory()[1] / 1e6:5.1f} MB" if measure_mem else ""
    print(f"  ingest : {load_ms:8.0f} ms  ({summary.total_variants:,} variants){mem_load}")

    ann = os.path.join(tmp, "ann.sqlite")
    build_sample_db(ann)
    store = AnnotationStore(ann)
    vocab = HpoVocabulary._from_sample()
    query = PhenotypeQuery(term_ids=["HP:0001250", "HP:0001263", "HP:0001252"])

    if measure_mem:
        tracemalloc.reset_peak()
    t = time.perf_counter()
    result = rank_variants(
        store.iter_annotated(sess.db_path),
        query,
        vocab,
        Weights(),
        PreFilter(enabled=False),  # worst case: score every variant
        top_n=100,
        annotations_available=True,
    )
    score_ms = (time.perf_counter() - t) * 1000
    mem_score = f"  peak-python {tracemalloc.get_traced_memory()[1] / 1e6:5.1f} MB" if measure_mem else ""
    if measure_mem:
        tracemalloc.stop()
    print(f"  score  : {score_ms:8.0f} ms  (scored {result.stats.scored:,}, "
          f"returned {result.stats.returned}){mem_score}")

    print(f"\nThroughput: ingest {summary.total_variants / (load_ms / 1000):,.0f} var/s, "
          f"score {result.stats.scored / (score_ms / 1000):,.0f} var/s. "
          f"Memory is flat in N (run with --mem to confirm).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
