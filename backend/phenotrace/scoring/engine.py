"""The transparent scoring engine.

Every variant's composite score is a sum of named, weighted factors. Each factor
is a pure function returning ``(raw, reason, available)`` where ``raw`` is in
[0,1]. Contributions (raw x weight) sum exactly to the composite, so the UI can
draw bars that add up. Missing annotations make a factor *unavailable* (it shows
"no score available" and contributes 0) rather than being silently zeroed into
the other factors.
"""
from __future__ import annotations

import heapq
import math
from typing import Iterable, Optional

from ..annotation.schema import canon_chrom
from ..models import (
    Annotation,
    FactorBreakdown,
    PhenotypeQuery,
    PreFilter,
    ScoreBreakdown,
    ScoredVariant,
    ScoreResult,
    ScoreStats,
    Variant,
    Weights,
)

Triple = tuple[Optional[float], str, bool]

# Factor display names (stable; referenced by the UI).
F_GENE = "Gene–phenotype association"
F_PATH = "Pathogenicity"
F_RARITY = "Rarity"
F_INHERIT = "Inheritance fit"

# Pathogenicity normalization: CADD PHRED ~20 ≈ likely deleterious, ~30 strong.
_CADD_SCALE = 30.0
# Rarity log-interpolation endpoints.
_AF_COMMON = 0.05
_AF_RARE = 1e-5


def cln_category(clnsig: Optional[str]) -> Optional[str]:
    if not clnsig:
        return None
    s = clnsig.lower()
    if "conflict" in s:
        return "CONF"
    if "likely_pathogenic" in s or "likely pathogenic" in s:
        return "LP"
    if "pathogenic" in s:
        return "P"
    if "likely_benign" in s or "likely benign" in s:
        return "LB"
    if "benign" in s:
        return "B"
    if "uncertain" in s:
        return "VUS"
    return None


# ---- factors --------------------------------------------------------------


def gene_phenotype_factor(ann: Annotation, query_ids: set[str], vocab) -> Triple:
    gene = ann.gene
    if not gene:
        return None, "No gene annotation for this variant", False
    if not query_ids:
        return None, "No phenotype terms in the query", False
    gterms = vocab.terms_for_gene(gene)
    if not gterms:
        return 0.0, f"Gene {gene} has no HPO associations in the loaded vocabulary", True

    # Each query term is weighted by its information content (specificity): a
    # match on a rare, specific phenotype counts more than one on a generic term
    # everything is linked to. raw stays in [0,1] (numerator/denominator both
    # scale by the same weights), so a single direct match is still exactly 1.0.
    direct = 0
    related = 0
    num = 0.0
    den = 0.0
    weighted = False
    matched_labels: list[str] = []
    for q in query_ids:
        w = vocab.term_specificity(q)
        if abs(w - 1.0) > 1e-9:
            weighted = True
        den += w
        if q in gterms:
            num += 1.0 * w
            direct += 1
            t = vocab.get(q)
            if t and len(matched_labels) < 3:
                matched_labels.append(t.label)
        elif gterms & vocab.descendants(q):
            num += 0.6 * w  # gene linked to a more specific phenotype than queried
            related += 1
        elif gterms & vocab.ancestors(q):
            num += 0.4 * w  # gene linked to a broader phenotype than queried
            related += 1
    raw = num / den if den > 0 else 0.0

    n = len(query_ids)
    if direct:
        reason = f"{gene} directly linked to {direct}/{n} query term(s)"
        if matched_labels:
            reason += " (" + ", ".join(matched_labels) + ")"
    else:
        reason = f"{gene} has no direct link to the {n} query term(s)"
    if related:
        reason += f"; {related} via related term(s)"
    if weighted and n > 1:
        reason += "; weighted by term specificity"
    return raw, reason, True


def pathogenicity_factor(ann: Annotation) -> Triple:
    parts: list[str] = []
    base: Optional[float] = None

    if ann.pathogenicity_score is not None:
        base = min(1.0, max(0.0, ann.pathogenicity_score / _CADD_SCALE))
        parts.append(f"{ann.pathogenicity_source or 'score'} {ann.pathogenicity_score:.1f}")

    cat = cln_category(ann.clnsig)
    cln_val: Optional[float] = None
    if cat == "P":
        cln_val = 0.97
        parts.append("ClinVar Pathogenic")
    elif cat == "LP":
        cln_val = 0.85
        parts.append("ClinVar Likely pathogenic")
    elif cat == "B":
        cln_val = 0.03
        parts.append("ClinVar Benign (penalty)")
    elif cat == "LB":
        cln_val = 0.20
        parts.append("ClinVar Likely benign")
    elif cat == "VUS":
        parts.append("ClinVar VUS (neutral)")
    elif cat == "CONF":
        parts.append("ClinVar conflicting (neutral)")

    if cln_val is not None:
        if base is None:
            base = cln_val
        elif cln_val >= 0.85:
            base = max(base, cln_val)  # pathogenic bump
        elif cln_val <= 0.20:
            base = min(base, cln_val)  # benign penalty

    if base is None and ann.consequence_rank is not None:
        base = max(0.0, min(1.0, ann.consequence_rank / 10.0))
        parts.append(f"{ann.consequence or 'consequence'} severity")

    if base is None:
        return None, "No pathogenicity data available", False
    return base, "; ".join(parts), True


def rarity_factor(ann: Annotation) -> Triple:
    af = ann.popmax_af if ann.popmax_af is not None else ann.af
    if af is None:
        return 0.85, "Absent from gnomAD (rare, but unconfirmed)", True
    if af <= 0:
        return 1.0, "Allele frequency 0 in gnomAD", True
    if af >= _AF_COMMON:
        return 0.0, f"Common variant (AF {af:.3g})", True
    if af <= _AF_RARE:
        return 1.0, f"Very rare (AF {af:.3g})", True
    raw = (math.log10(_AF_COMMON) - math.log10(af)) / (
        math.log10(_AF_COMMON) - math.log10(_AF_RARE)
    )
    return max(0.0, min(1.0, raw)), f"gnomAD AF {af:.3g}", True


def inheritance_factor(variant: Variant, inheritance: Optional[str]) -> Triple:
    z = variant.zygosity
    if not inheritance:
        return 0.5, "No inheritance model specified (neutral)", True
    if z is None:
        return 0.5, f"{inheritance}: genotype unknown (neutral)", True
    model = inheritance.lower().replace("-", "_").replace(" ", "_")
    chrom = canon_chrom(variant.chrom)

    if model in ("ar", "recessive", "autosomal_recessive"):
        if z == "hom":
            return 1.0, "AR: homozygous — consistent", True
        if z == "hemi":
            return 0.6, "AR: hemizygous", True
        return 0.4, "AR: single heterozygote — needs a second hit", True
    if model in ("ad", "dominant", "autosomal_dominant"):
        if z == "het":
            return 1.0, "AD: heterozygous — consistent", True
        if z == "hom":
            return 0.7, "AD: homozygous", True
        return 0.6, "AD: hemizygous", True
    if model in ("xl", "x_linked", "xlinked"):
        if chrom != "X":
            return 0.2, "XL: variant not on chrX — inconsistent", True
        if z == "hemi":
            return 1.0, "XL: hemizygous on X — consistent", True
        if z == "hom":
            return 0.9, "XL: homozygous on X", True
        return 0.5, "XL: heterozygous on X (possible carrier)", True
    if model in ("de_novo", "denovo"):
        return 0.7, "de novo cannot be confirmed without parental data", True
    return 0.5, f"Unknown model '{inheritance}' (neutral)", True


# ---- composition ----------------------------------------------------------
#
# The hot loop computes plain tuples (no pydantic) for every variant and only
# materializes pydantic FactorBreakdown/ScoreBreakdown/Variant/Annotation/
# ScoredVariant for the top-N survivors — keeping whole-VCF scoring fast.

# A factor tuple: (name, weight, raw|None, reason, available, contribution)
FactorTuple = tuple[str, float, Optional[float], str, bool, float]


def _ftuple(name: str, weight: float, triple: Triple) -> FactorTuple:
    raw, reason, available = triple
    contribution = (raw or 0.0) * weight if (available and raw is not None) else 0.0
    return (name, weight, raw if available else None, reason, available, round(contribution, 4))


def _compute(lv, la, qids: set[str], inheritance: Optional[str], vocab, weights: Weights):
    fts = [
        _ftuple(F_GENE, weights.gene_phenotype, gene_phenotype_factor(la, qids, vocab)),
        _ftuple(F_PATH, weights.pathogenicity, pathogenicity_factor(la)),
        _ftuple(F_RARITY, weights.rarity, rarity_factor(la)),
        _ftuple(F_INHERIT, weights.inheritance, inheritance_factor(lv, inheritance)),
    ]
    composite = round(sum(ft[5] for ft in fts), 4)
    return composite, fts


def _breakdown(composite: float, fts: list[FactorTuple]) -> ScoreBreakdown:
    factors = [
        FactorBreakdown(name=n, weight=w, raw=raw, reason=rs, available=av, contribution=c)
        for (n, w, raw, rs, av, c) in fts
    ]
    return ScoreBreakdown(composite=composite, factors=factors)


def score_variant(
    variant, ann, query: PhenotypeQuery, vocab, weights: Weights
) -> ScoreBreakdown:
    composite, fts = _compute(
        variant, ann, set(query.term_ids), query.inheritance, vocab, weights
    )
    return _breakdown(composite, fts)


def _to_variant(lv) -> Variant:
    return Variant(
        id=lv.id, row=lv.row, chrom=lv.chrom, pos=lv.pos, ref=lv.ref, alt=lv.alt,
        qual=lv.qual, filter=lv.filter or ".", genotype=lv.genotype, zygosity=lv.zygosity,
    )


def _to_annotation(la) -> Annotation:
    return Annotation(
        variant_id=la.variant_id, af=la.af, popmax_af=la.popmax_af, clnsig=la.clnsig,
        clnrevstat=la.clnrevstat, gene=la.gene, consequence=la.consequence,
        consequence_rank=la.consequence_rank, pathogenicity_score=la.pathogenicity_score,
        pathogenicity_source=la.pathogenicity_source,
    )


def _headline(ann: Annotation, factors: list[FactorBreakdown]) -> str:
    parts: list[str] = []
    gp = factors[0]  # gene–phenotype is always first
    if gp.available and gp.raw and gp.raw > 0:
        parts.append(gp.reason.split(";")[0])
    cat = cln_category(ann.clnsig)
    if cat == "P":
        parts.append("ClinVar Pathogenic")
    elif cat == "LP":
        parts.append("ClinVar Likely pathogenic")
    elif cat in ("B", "LB"):
        parts.append("ClinVar benign")
    if not parts:
        top = max(factors, key=lambda f: f.contribution)
        parts.append(top.reason.split(";")[0])
    return " · ".join(parts)


def rank_variants(
    annotated: Iterable[tuple],
    query: PhenotypeQuery,
    vocab,
    weights: Weights,
    prefilter: PreFilter,
    top_n: int,
    annotations_available: bool,
) -> ScoreResult:
    qids = set(query.term_ids)
    inheritance = query.inheritance
    total = 0
    pf_common = 0
    pf_nonpass = 0
    scored = 0
    # Bounded min-heap of (composite, counter, lite_variant, lite_ann, factor_tuples).
    heap: list[tuple] = []
    counter = 0

    for lv, la in annotated:
        total += 1
        if prefilter.enabled:
            if prefilter.drop_non_pass and lv.filter not in ("PASS", "."):
                pf_nonpass += 1
                continue
            af = la.popmax_af if la.popmax_af is not None else la.af
            if af is not None and af > prefilter.max_af:
                pf_common += 1
                continue

        composite, fts = _compute(lv, la, qids, inheritance, vocab, weights)
        scored += 1
        heapq.heappush(heap, (composite, counter, lv, la, fts))
        counter += 1
        if len(heap) > top_n:
            heapq.heappop(heap)

    ordered = sorted(heap, key=lambda x: (x[0], -x[1]), reverse=True)
    results: list[ScoredVariant] = []
    for composite, _c, lv, la, fts in ordered:
        bd = _breakdown(composite, fts)
        ann = _to_annotation(la)
        results.append(
            ScoredVariant(
                variant=_to_variant(lv),
                annotation=ann,
                breakdown=bd,
                headline=_headline(ann, bd.factors),
            )
        )

    stats = ScoreStats(
        total=total,
        prefiltered_common=pf_common,
        prefiltered_non_pass=pf_nonpass,
        scored=scored,
        returned=len(results),
        annotations_available=annotations_available,
    )
    return ScoreResult(
        results=results, stats=stats, weights=weights, query=query, prefilter=prefilter
    )
