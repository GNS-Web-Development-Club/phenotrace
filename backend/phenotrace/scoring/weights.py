"""Default scoring weights + pre-filter, and the rationale behind them.

Weights are surfaced as UI sliders (Phase 5). They sum to 1.0 so the composite
stays in [0,1]; gene–phenotype association is weighted heaviest because, in a
phenotype-driven tool, "does this gene explain the symptoms?" is the primary
question. The rationale strings are shown to the user — the model is meant to be
inspected, not trusted blindly.
"""
from __future__ import annotations

from ..models import PreFilter, Weights

DEFAULT_WEIGHTS = Weights()
DEFAULT_PREFILTER = PreFilter()

WEIGHT_RATIONALE: dict[str, str] = {
    "gene_phenotype": "How well the variant's gene explains the queried phenotype (graph-propagated). The primary signal in a phenotype-driven tool.",
    "pathogenicity": "Predicted damage (CADD-style score) plus ClinVar significance — bumped for Pathogenic, penalized for Benign.",
    "rarity": "Rare variants are more likely causal for rare disease. Absent-from-gnomAD is treated as rare-but-uncertain, not maximally rare.",
    "inheritance": "Consistency of the genotype with an (optional) inheritance model. Kept light without pedigree data.",
}
