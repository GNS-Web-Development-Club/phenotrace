"""Bundled, offline sample-VCF library.

A handful of small SYNTHETIC patient VCFs whose loci line up with the sample
annotation DB, so each one produces a clear, story-driven ranking out of the
box. These are demo data — never real patients — and let the tool be evaluated
without the user having to supply their own VCF.
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import _resource_base


@dataclass(frozen=True)
class SampleVcf:
    id: str
    filename: str
    title: str
    description: str
    phenotype: str  # suggested clinical free-text to map
    variants: int


SAMPLES: list[SampleVcf] = [
    SampleVcf(
        id="epilepsy",
        filename="epilepsy_dev_delay.vcf",
        title="Epilepsy & developmental delay",
        description="Infant with seizures, global developmental delay, and low muscle tone. SCN1A and MECP2 should rank highest.",
        phenotype="seizures, developmental delay, low muscle tone",
        variants=8,
    ),
    SampleVcf(
        id="cystic_fibrosis",
        filename="cystic_fibrosis.vcf",
        title="Cystic fibrosis (respiratory)",
        description="Recurrent chest infections, salty sweat, and failure to thrive. A homozygous CFTR frameshift should rank highest.",
        phenotype="recurrent chest infections, salty sweat, failure to thrive",
        variants=6,
    ),
    SampleVcf(
        id="hypercholesterolemia",
        filename="familial_hypercholesterolemia.vcf",
        title="Familial hypercholesterolemia",
        description="Very high cholesterol with early coronary artery disease. LDLR should rank above an incidental, phenotype-irrelevant pathogenic variant.",
        phenotype="high cholesterol and early coronary artery disease",
        variants=6,
    ),
]


def samples_dir():
    return _resource_base() / "fixtures" / "samples"


def get_sample(sample_id: str) -> SampleVcf | None:
    return next((s for s in SAMPLES if s.id == sample_id), None)


def sample_path(sample_id: str):
    s = get_sample(sample_id)
    if s is None:
        return None
    return samples_dir() / s.filename
