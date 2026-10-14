"""Bundled SAMPLE annotation database.

This is small, clearly-labeled *development* data — NOT real gnomAD/ClinVar/CADD.
Its loci line up with `fixtures/sample.vcf` so the full pipeline (annotate ->
phenotype -> score) works out-of-the-box and offline. Every meta row is flagged
`is_sample=1`; the UI surfaces that so the data is never mistaken for real.

Swap in real data with `tools/db-builder/build_db.py`.
"""
from __future__ import annotations

from ..config import annotation_db_path
from .schema import build_database

# Fixed, honest snapshot dates for the sample data.
_META = {
    "gnomad": {"version": "sample-v1", "snapshot_date": "2024-01-15", "is_sample": True},
    "clinvar": {"version": "sample-v1", "snapshot_date": "2024-02-01", "is_sample": True},
    "pathogenicity": {"version": "CADD-1.6-sample", "snapshot_date": "2024-01-10", "is_sample": True},
    "gene_map": {"version": "VEP-sample", "snapshot_date": "2024-01-10", "is_sample": True},
}

# (chrom, pos, ref, alt, af, popmax_af)
_GNOMAD = [
    # chr2:166277081 (SCN1A path.) intentionally ABSENT -> rare-but-uncertain
    ("16", 2092900, "C", "T", 1e-5, 2e-5),
    ("1", 11790000, "G", "A", 0.002, 0.004),
    ("1", 11790000, "G", "T", 0.01, 0.015),
    # chrX:153296777 (MECP2 path.) ABSENT -> rare
    ("7", 117559590, "ATCT", "A", 0.007, 0.012),
    # chr12:25245350 (KRAS) ABSENT -> rare
    ("3", 200000, "T", "C", 0.30, 0.35),  # common intergenic
    ("3", 300000, "G", "GA", 0.20, 0.25),  # common
    ("17", 43093000, "T", "C", 0.40, 0.45),  # common benign
    ("2", 166277100, "G", "A", 0.001, 0.002),
    ("19", 11089000, "C", "T", 0.0005, 0.001),
]

# (chrom, pos, ref, alt, clnsig, clnrevstat, gene)
_CLINVAR = [
    ("2", 166277081, "A", "G", "Pathogenic", "criteria_provided,_multiple_submitters,_no_conflicts", "SCN1A"),
    ("16", 2092900, "C", "T", "Likely_pathogenic", "criteria_provided,_single_submitter", "TSC2"),
    ("X", 153296777, "C", "T", "Pathogenic", "reviewed_by_expert_panel", "MECP2"),
    ("7", 117559590, "ATCT", "A", "Pathogenic", "criteria_provided,_multiple_submitters,_no_conflicts", "CFTR"),
    ("12", 25245350, "C", "A", "Uncertain_significance", "criteria_provided,_single_submitter", "KRAS"),
    ("3", 300000, "G", "GA", "Benign", "criteria_provided,_multiple_submitters,_no_conflicts", None),
    ("17", 43093000, "T", "C", "Benign", "criteria_provided,_multiple_submitters,_no_conflicts", "BRCA1"),
    ("2", 166277100, "G", "A", "Uncertain_significance", "criteria_provided,_single_submitter", "SCN1A"),
    ("19", 11089000, "C", "T", "Likely_pathogenic", "criteria_provided,_single_submitter", "LDLR"),
]

# (chrom, pos, ref, alt, score, source)  -- CADD-phred-like (0..~40)
_PATHO_SRC = "CADD v1.6 (sample subset)"
_PATHOGENICITY = [
    ("2", 166277081, "A", "G", 28.5, _PATHO_SRC),
    ("16", 2092900, "C", "T", 25.1, _PATHO_SRC),
    ("1", 11790000, "G", "A", 22.0, _PATHO_SRC),
    ("1", 11790000, "G", "T", 15.3, _PATHO_SRC),
    ("X", 153296777, "C", "T", 26.8, _PATHO_SRC),
    ("7", 117559590, "ATCT", "A", 33.0, _PATHO_SRC),
    ("12", 25245350, "C", "A", 24.4, _PATHO_SRC),
    ("17", 43093000, "T", "C", 12.1, _PATHO_SRC),
    ("2", 166277100, "G", "A", 18.0, _PATHO_SRC),
    ("19", 11089000, "C", "T", 23.2, _PATHO_SRC),
    # chr3:200000 and chr3:300000 deliberately have NO score (missing-handling).
]

# (chrom, pos, ref, alt, gene, consequence, consequence_rank)
_GENE_MAP = [
    ("2", 166277081, "A", "G", "SCN1A", "missense", 5),
    ("16", 2092900, "C", "T", "TSC2", "missense", 5),
    ("1", 11790000, "G", "A", "MTOR", "missense", 5),
    ("1", 11790000, "G", "T", "MTOR", "synonymous", 2),
    ("X", 153296777, "C", "T", "MECP2", "missense", 5),
    ("7", 117559590, "ATCT", "A", "CFTR", "frameshift", 9),
    ("12", 25245350, "C", "A", "KRAS", "missense", 5),
    ("17", 43093000, "T", "C", "BRCA1", "missense", 5),
    ("2", 166277100, "G", "A", "SCN1A", "missense", 5),
    ("19", 11089000, "C", "T", "LDLR", "missense", 5),
    # chr3:200000 and chr3:300000 have NO gene (intergenic; missing-handling).
]


def build_sample_db(path: str | None = None) -> dict[str, int]:
    target = str(path or annotation_db_path())
    return build_database(
        target,
        gnomad=_GNOMAD,
        clinvar=_CLINVAR,
        pathogenicity=_PATHOGENICITY,
        gene_map=_GENE_MAP,
        meta=_META,
    )
