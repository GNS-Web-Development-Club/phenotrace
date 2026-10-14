from __future__ import annotations

import pytest

from phenotrace.annotation.sample_db import build_sample_db
from phenotrace.annotation.store import AnnotationStore
from phenotrace.hpo.vocabulary import HpoVocabulary
from phenotrace.models import Annotation, PhenotypeQuery, PreFilter, Variant, Weights
from phenotrace.scoring.engine import (
    gene_phenotype_factor,
    inheritance_factor,
    pathogenicity_factor,
    rank_variants,
    rarity_factor,
    score_variant,
)
from phenotrace.vcf.store import VcfSession


@pytest.fixture(scope="module")
def vocab():
    return HpoVocabulary._from_sample()


def _ann(**kw) -> Annotation:
    base = dict(variant_id="v")
    base.update(kw)
    return Annotation(**base)


def _var(**kw) -> Variant:
    base = dict(id="v", row=1, chrom="chr1", pos=1, ref="A", alt="G")
    base.update(kw)
    return Variant(**base)


# ---- factor math ----------------------------------------------------------


def test_rarity_absent_is_rare_but_uncertain():
    raw, _, avail = rarity_factor(_ann(af=None, popmax_af=None))
    assert avail and raw == 0.85


def test_rarity_common_is_zero():
    raw, _, _ = rarity_factor(_ann(popmax_af=0.4))
    assert raw == 0.0


def test_rarity_monotonic():
    rare = rarity_factor(_ann(popmax_af=1e-4))[0]
    less_rare = rarity_factor(_ann(popmax_af=1e-2))[0]
    assert 0.0 <= less_rare < rare <= 1.0


def test_pathogenicity_clinvar_bump_and_penalty():
    high = pathogenicity_factor(_ann(pathogenicity_score=10, clnsig="Pathogenic"))[0]
    assert high >= 0.95  # ClinVar Pathogenic overrides a modest score
    low = pathogenicity_factor(_ann(pathogenicity_score=35, clnsig="Benign"))[0]
    assert low <= 0.05  # ClinVar Benign penalizes a high score


def test_pathogenicity_missing_is_unavailable():
    raw, reason, avail = pathogenicity_factor(_ann())
    assert raw is None and avail is False and "No pathogenicity" in reason


def test_pathogenicity_falls_back_to_consequence():
    raw, _, avail = pathogenicity_factor(_ann(consequence="frameshift", consequence_rank=9))
    assert avail and raw == pytest.approx(0.9)


def test_gene_phenotype_direct_related_and_none(vocab):
    q = {"HP:0001250"}  # Seizure
    raw, _, avail = gene_phenotype_factor(_ann(gene="SCN1A"), q, vocab)
    assert avail and raw == 1.0

    # Status epilepticus (HP:0002133) is a descendant of Seizure -> partial credit
    raw2, _, _ = gene_phenotype_factor(_ann(gene="SCN1A"), {"HP:0012638"}, vocab)
    assert 0 < raw2 < 1  # query is an ancestor of SCN1A's terms

    raw3, reason3, avail3 = gene_phenotype_factor(_ann(gene=None), q, vocab)
    assert raw3 is None and avail3 is False

    raw4, _, avail4 = gene_phenotype_factor(_ann(gene="LDLR"), q, vocab)
    assert avail4 and raw4 == 0.0  # gene known, no link to Seizure


def test_term_specificity_ranks_rare_terms_higher(vocab):
    # Developmental delay is linked to ~1 gene in the sample (specific); seizure is
    # linked to several (generic). The specific term must carry a higher weight.
    spec_specific = vocab.term_specificity("HP:0001263")  # global developmental delay
    spec_generic = vocab.term_specificity("HP:0001250")  # seizure
    assert 0.4 <= spec_generic < spec_specific <= 1.0


def test_gene_phenotype_weighting_favors_specific_match(vocab):
    # Two genes each matching one of two query terms. The gene matching the more
    # specific term should score higher than the one matching the generic term.
    q = {"HP:0001250", "HP:0001263"}  # seizure (generic) + dev-delay (specific)
    # MTOR is linked to seizure (generic) but not dev-delay.
    mtor_raw = gene_phenotype_factor(_ann(gene="MTOR"), q, vocab)[0]
    # SCN1A is linked to BOTH, so it should clearly beat a single generic match.
    scn1a_raw = gene_phenotype_factor(_ann(gene="SCN1A"), q, vocab)[0]
    assert scn1a_raw > mtor_raw
    assert 0.0 < mtor_raw < 1.0


def test_inheritance_models():
    assert inheritance_factor(_var(zygosity="hom"), "AR")[0] == 1.0
    assert inheritance_factor(_var(zygosity="het"), "AD")[0] == 1.0
    assert inheritance_factor(_var(chrom="chrX", zygosity="hemi"), "XL")[0] == 1.0
    assert inheritance_factor(_var(chrom="chr1", zygosity="het"), "XL")[0] == 0.2
    assert inheritance_factor(_var(zygosity="het"), None)[0] == 0.5


def test_composite_equals_sum_of_contributions(vocab):
    bd = score_variant(
        _var(zygosity="het"),
        _ann(gene="SCN1A", pathogenicity_score=28, clnsig="Pathogenic", af=None),
        PhenotypeQuery(term_ids=["HP:0001250", "HP:0001263"]),
        vocab,
        Weights(),
    )
    assert bd.composite == pytest.approx(sum(f.contribution for f in bd.factors))
    assert 0.0 <= bd.composite <= 1.0


# ---- end-to-end ranking ---------------------------------------------------


@pytest.fixture
def pipeline(tmp_path, sample_vcf):
    ann_path = tmp_path / "ann.sqlite"
    build_sample_db(str(ann_path))
    store = AnnotationStore(str(ann_path))
    sess = VcfSession(str(tmp_path / "s.sqlite"))
    sess.load(sample_vcf)
    return store, sess


def test_ranking_is_phenotype_driven(pipeline, vocab):
    store, sess = pipeline
    query = PhenotypeQuery(term_ids=["HP:0001250", "HP:0001263", "HP:0001252"])  # seizure/dev-delay/hypotonia
    result = rank_variants(
        store.iter_annotated(sess.db_path),
        query,
        vocab,
        Weights(),
        PreFilter(),
        top_n=50,
        annotations_available=True,
    )

    # prefilter: 2 non-PASS (LowQual) + 3 common (AF>0.05) dropped from 12.
    assert result.stats.total == 12
    assert result.stats.prefiltered_non_pass == 2
    assert result.stats.prefiltered_common == 3
    assert result.stats.scored == 7

    top_genes = {result.results[0].annotation.gene, result.results[1].annotation.gene}
    assert top_genes == {"SCN1A", "MECP2"}

    returned_ids = {sv.variant.id for sv in result.results}
    assert "chr17:43093000:T:C" not in returned_ids  # BRCA1, common -> prefiltered

    # every result decomposes exactly
    for sv in result.results:
        assert sv.breakdown.composite == pytest.approx(
            sum(f.contribution for f in sv.breakdown.factors)
        )
    # LDLR is rare/pathogenic but unrelated to the phenotype -> gene factor 0, low rank
    ldlr = next(sv for sv in result.results if sv.annotation.gene == "LDLR")
    gene_factor = ldlr.breakdown.factors[0]
    assert gene_factor.available and gene_factor.raw == 0.0


def test_prefilter_disabled_keeps_all(pipeline, vocab):
    store, sess = pipeline
    query = PhenotypeQuery(term_ids=["HP:0001250"])
    result = rank_variants(
        store.iter_annotated(sess.db_path),
        query,
        vocab,
        Weights(),
        PreFilter(enabled=False),
        top_n=500,
        annotations_available=True,
    )
    assert result.stats.scored == 12
    assert result.stats.prefiltered_common == 0
