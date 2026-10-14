"""Pydantic models — the single shared contract between Rust-equivalent backend
logic, the HTTP API, and the TypeScript frontend.

These mirror the data shapes named in PLAN.md's command surface. Field names are
deliberately stable; the frontend's TS types are generated to match (see
frontend/src/lib/types.ts).
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Variant(BaseModel):
    """One ALT allele at one locus, as carried by the (first) sample."""

    id: str  # canonical "chrom:pos:ref:alt"
    row: int  # 1-based order of appearance after multiallelic splitting
    chrom: str
    pos: int
    ref: str
    alt: str
    qual: Optional[float] = None
    filter: str = "."
    genotype: Optional[str] = None  # raw GT string, e.g. "0/1"
    zygosity: Optional[str] = None  # het | hom | hemi | None(unknown)


class VcfSummary(BaseModel):
    file_path: str
    total_variants: int
    samples: list[str] = Field(default_factory=list)
    sample_name: Optional[str] = None
    fileformat: Optional[str] = None
    reference: Optional[str] = None
    parse_time_ms: float
    multiallelic_records: int = 0  # ALT-allele rows produced from multiallelic sites
    skipped_lines: int = 0
    warnings: list[str] = Field(default_factory=list)
    first_variants: list[Variant] = Field(default_factory=list)


class SampleInfo(BaseModel):
    """A bundled, offline demo VCF the user can load with one click."""

    id: str
    title: str
    description: str
    phenotype: str  # suggested clinical free-text
    variants: int


class Annotation(BaseModel):
    """Per-variant enrichment from local DBs. Any field may be None (absent)."""

    variant_id: str
    af: Optional[float] = None
    popmax_af: Optional[float] = None
    clnsig: Optional[str] = None
    clnrevstat: Optional[str] = None
    gene: Optional[str] = None
    consequence: Optional[str] = None
    consequence_rank: Optional[int] = None
    pathogenicity_score: Optional[float] = None
    pathogenicity_source: Optional[str] = None


class HpoTerm(BaseModel):
    id: str  # "HP:0001250"
    label: str
    definition: Optional[str] = None
    synonyms: list[str] = Field(default_factory=list)


class HpoCandidate(BaseModel):
    term: HpoTerm
    confidence: float  # [0,1]
    matched_text: str
    span_start: int
    span_end: int
    source: str  # label | synonym | layterm


class PhenotypeQuery(BaseModel):
    term_ids: list[str] = Field(default_factory=list)
    inheritance: Optional[str] = None  # AD | AR | XL | de_novo | None


class Weights(BaseModel):
    """Composite scoring weights. Defaults sum to 1.0; surfaced as UI sliders."""

    gene_phenotype: float = 0.45
    pathogenicity: float = 0.25
    rarity: float = 0.20
    inheritance: float = 0.10


class PreFilter(BaseModel):
    """Visible, adjustable pre-scoring filter. Never hides a variant silently."""

    max_af: float = 0.05  # drop variants more common than this (popmax)
    drop_non_pass: bool = True  # drop FILTER not in {PASS, .}
    enabled: bool = True


class FactorBreakdown(BaseModel):
    name: str
    available: bool  # False => annotation missing; contributes 0 but is shown
    raw: Optional[float] = None  # [0,1] factor value before weighting
    weight: float
    contribution: float  # raw * weight (0 when unavailable)
    reason: str  # human-readable, e.g. "SCN1A strongly linked to Seizure + 3 terms"


class ScoreBreakdown(BaseModel):
    composite: float  # sum of factor contributions, in [0,1]
    factors: list[FactorBreakdown]


class ScoredVariant(BaseModel):
    variant: Variant
    annotation: Annotation
    breakdown: ScoreBreakdown
    headline: str  # one-line "why" for the ranked row


class ScoreStats(BaseModel):
    total: int  # variants in the loaded VCF
    prefiltered_common: int  # dropped: AF above threshold
    prefiltered_non_pass: int  # dropped: FILTER not PASS/.
    scored: int  # variants that went through scoring
    returned: int  # rows in `results` (top-N)
    annotations_available: bool


class ScoreResult(BaseModel):
    results: list[ScoredVariant]
    stats: ScoreStats
    weights: Weights
    query: PhenotypeQuery
    prefilter: PreFilter


class DbMeta(BaseModel):
    source: str  # gnomad | clinvar | pathogenicity | gene_map | hpo
    present: bool
    version: Optional[str] = None
    snapshot_date: Optional[str] = None
    row_count: Optional[int] = None
    path: Optional[str] = None
