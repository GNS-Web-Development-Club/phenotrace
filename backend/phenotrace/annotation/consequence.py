"""Functional-consequence severity ranking.

A small SO-term -> severity map. Higher = more severe. Used to store a
precomputed ``consequence_rank`` in ``gene_map`` and (lightly) by scoring when no
precomputed pathogenicity score is available.
"""
from __future__ import annotations

CONSEQUENCE_RANK: dict[str, int] = {
    "transcript_ablation": 10,
    "stop_gained": 10,
    "splice_acceptor": 9,
    "splice_donor": 9,
    "frameshift": 9,
    "start_lost": 8,
    "stop_lost": 8,
    "transcript_amplification": 7,
    "inframe_insertion": 6,
    "inframe_deletion": 6,
    "inframe_indel": 6,
    "missense": 5,
    "protein_altering": 5,
    "splice_region": 4,
    "incomplete_terminal_codon": 3,
    "start_retained": 3,
    "stop_retained": 3,
    "synonymous": 2,
    "5_prime_utr": 2,
    "3_prime_utr": 2,
    "intron": 1,
    "non_coding_transcript": 1,
    "upstream": 1,
    "downstream": 1,
    "intergenic": 0,
}

MAX_RANK = 10


def normalize_rank(rank: int | None) -> float | None:
    if rank is None:
        return None
    return max(0.0, min(1.0, rank / MAX_RANK))
