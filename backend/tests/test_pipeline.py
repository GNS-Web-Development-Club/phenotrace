"""Golden-file end-to-end pipeline test.

Runs the whole flow on the fixture VCF + a known phenotype and asserts stable,
meaningful ranking properties — the integration safety net for the scoring model.
"""
from __future__ import annotations

import pytest

from phenotrace.annotation.sample_db import build_sample_db
from phenotrace.annotation.store import AnnotationStore
from phenotrace.hpo.matcher import PhenotypeMatcher
from phenotrace.hpo.vocabulary import HpoVocabulary
from phenotrace.models import PhenotypeQuery, PreFilter, Weights
from phenotrace.scoring.engine import rank_variants
from phenotrace.vcf.store import VcfSession


def test_full_pipeline_golden(tmp_path, sample_vcf):
    # 1) ingest VCF
    sess = VcfSession(str(tmp_path / "s.sqlite"))
    sess.load(sample_vcf)

    # 2) annotation DB
    ann_path = tmp_path / "ann.sqlite"
    build_sample_db(str(ann_path))
    store = AnnotationStore(str(ann_path))

    # 3) phenotype text -> HPO terms (lexical)
    vocab = HpoVocabulary._from_sample()
    matcher = PhenotypeMatcher(vocab)
    cands = matcher.match("seizures, developmental delay, low muscle tone")
    term_ids = [c.term.id for c in cands]
    assert {"HP:0001250", "HP:0001263", "HP:0001252"} <= set(term_ids)

    # 4) score
    result = rank_variants(
        store.iter_annotated(sess.db_path),
        PhenotypeQuery(term_ids=term_ids),
        vocab,
        Weights(),
        PreFilter(),
        top_n=100,
        annotations_available=True,
    )

    genes = [sv.annotation.gene for sv in result.results]

    # Golden properties:
    assert genes[:2] == ["SCN1A", "MECP2"]  # phenotype-matching, pathogenic, rare
    # Composite reflects information-content weighting of the matched phenotypes.
    assert result.results[0].breakdown.composite == pytest.approx(0.7394, abs=1e-3)
    assert "BRCA1" not in genes  # common -> pre-filtered
    assert "CFTR" not in genes  # non-PASS -> pre-filtered

    # LDLR is rare+pathogenic but unrelated to the phenotype -> ranks below all matches
    assert genes.index("LDLR") > genes.index("TSC2")

    # monotonic non-increasing, and every score decomposes exactly
    comps = [sv.breakdown.composite for sv in result.results]
    assert comps == sorted(comps, reverse=True)
    for sv in result.results:
        assert sv.breakdown.composite == pytest.approx(
            sum(f.contribution for f in sv.breakdown.factors)
        )
        assert 0.0 <= sv.breakdown.composite <= 1.0
