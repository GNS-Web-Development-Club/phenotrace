from __future__ import annotations

import pytest

from phenotrace.hpo.matcher import PhenotypeMatcher
from phenotrace.hpo.vocabulary import HpoVocabulary


@pytest.fixture(scope="module")
def vocab() -> HpoVocabulary:
    return HpoVocabulary._from_sample()


@pytest.fixture(scope="module")
def matcher(vocab) -> PhenotypeMatcher:
    return PhenotypeMatcher(vocab)


def _ids(cands):
    return [c.term.id for c in cands]


def test_vocab_loads_sample(vocab):
    assert vocab.is_sample
    assert len(vocab) >= 35
    assert vocab.get("HP:0001250").label == "Seizure"


def test_graph_propagation(vocab):
    # Status epilepticus is_a Seizure
    assert "HP:0001250" in vocab.ancestors("HP:0002133")
    assert "HP:0002133" in vocab.descendants("HP:0001250")
    # Seizure rolls up to the nervous-system roots
    assert "HP:0000707" in vocab.ancestors("HP:0001250")


def test_gene_phenotype_links(vocab):
    assert "HP:0001250" in vocab.terms_for_gene("SCN1A")
    assert "SCN1A" in vocab.genes_for_term("HP:0001250")
    assert "MECP2" in vocab.genes_for_term("HP:0007281")


def test_acceptance_phrase(matcher):
    # PLAN.md acceptance: this phrase must yield Seizure + dev-delay + Hypotonia.
    cands = matcher.match("seizures, developmental delay, low muscle tone")
    ids = _ids(cands)
    assert "HP:0001250" in ids  # Seizure
    assert "HP:0001263" in ids  # Global developmental delay
    assert "HP:0001252" in ids  # Hypotonia


def test_multiword_consumed_as_single_span(matcher):
    cands = matcher.match("patient has low muscle tone")
    hypo = [c for c in cands if c.term.id == "HP:0001252"]
    assert len(hypo) == 1
    assert hypo[0].matched_text.lower() == "low muscle tone"
    assert hypo[0].source == "synonym"


def test_layterms(matcher):
    cands = matcher.match("baby is floppy and has fits")
    ids = _ids(cands)
    assert "HP:0001252" in ids  # floppy -> Hypotonia
    assert "HP:0001250" in ids  # fits -> Seizure
    floppy = next(c for c in cands if c.term.id == "HP:0001252")
    assert floppy.source == "layterm"


def test_singularization_and_label_priority(matcher):
    cands = matcher.match("convulsions")
    seizure = next(c for c in cands if c.term.id == "HP:0001250")
    assert seizure.source == "synonym"  # "convulsions" is a synonym
    cands2 = matcher.match("seizure")
    assert next(c for c in cands2 if c.term.id == "HP:0001250").source == "label"


def test_no_false_positive_on_unrelated_text(matcher):
    assert matcher.match("the quick brown fox") == []


def test_search_autocomplete(vocab):
    res = vocab.search("seiz")
    assert res and res[0].id == "HP:0001250"
    res2 = vocab.search("cholesterol")
    assert any(t.id == "HP:0003124" for t in res2)
