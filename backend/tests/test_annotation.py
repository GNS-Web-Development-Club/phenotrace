from __future__ import annotations

import pytest

from phenotrace.annotation.schema import build_database, canon_chrom
from phenotrace.annotation.sample_db import build_sample_db
from phenotrace.annotation.sources import (
    parse_clinvar_vcf,
    parse_cadd_tsv,
    parse_gnomad_vcf,
)
from phenotrace.annotation.store import AnnotationStore, parse_variant_id
from phenotrace.models import Variant


@pytest.fixture
def store(tmp_path):
    p = tmp_path / "annotations.sqlite"
    build_sample_db(str(p))
    return AnnotationStore(str(p))


def _v(vid: str) -> Variant:
    chrom, pos, ref, alt = vid.split(":")
    return Variant(id=vid, row=1, chrom=chrom, pos=int(pos), ref=ref, alt=alt)


def test_canon_chrom():
    assert canon_chrom("chr2") == "2"
    assert canon_chrom("2") == "2"
    assert canon_chrom("chrX") == "X"
    assert canon_chrom("MT") == "MT"


def test_parse_variant_id():
    assert parse_variant_id("chr2:166277081:A:G") == ("chr2", 166277081, "A", "G")
    assert parse_variant_id("garbage") is None
    assert parse_variant_id("chr2:notanint:A:G") is None


def test_build_counts(tmp_path):
    counts = build_sample_db(str(tmp_path / "a.sqlite"))
    assert counts == {"gnomad": 9, "clinvar": 9, "pathogenicity": 10, "gene_map": 10}


def test_annotate_full_pathogenic(store):
    a = store.annotate_variants([_v("chr2:166277081:A:G")])[0]
    assert a.gene == "SCN1A"
    assert a.consequence == "missense"
    assert a.consequence_rank == 5
    assert a.clnsig == "Pathogenic"
    assert a.pathogenicity_score == 28.5
    assert a.af is None  # deliberately absent from gnomad -> rare-but-uncertain


def test_annotate_common_intergenic_missing_fields(store):
    a = store.annotate_variants([_v("chr3:200000:T:C")])[0]
    assert a.gene is None
    assert a.clnsig is None
    assert a.pathogenicity_score is None
    assert a.consequence is None
    assert a.af == 0.30
    assert a.popmax_af == 0.35


def test_chr_prefix_agnostic(store):
    # query without 'chr' prefix must hit the same row
    a = store.annotate_variants([_v("2:166277081:A:G")])[0]
    assert a.gene == "SCN1A"


def test_clinvar_gene_fallback(tmp_path):
    p = tmp_path / "x.sqlite"
    build_database(
        str(p),
        clinvar=[("9", 100, "A", "T", "Pathogenic", "rev", "FALLBACKGENE")],
        gene_map=[],  # no gene_map row -> gene must come from clinvar
        meta={},
    )
    a = AnnotationStore(str(p)).annotate_variants([_v("chr9:100:A:T")])[0]
    assert a.gene == "FALLBACKGENE"
    assert a.clnsig == "Pathogenic"


def test_db_status_flags_sample(store):
    metas = {m.source: m for m in store.db_status()}
    assert metas["clinvar"].present
    assert "SAMPLE DATA" in (metas["clinvar"].version or "")
    assert metas["clinvar"].snapshot_date == "2024-02-01"
    assert metas["gnomad"].row_count == 9


def test_unavailable_store_is_graceful():
    s = AnnotationStore("definitely_missing.sqlite")
    assert not s.available()
    a = s.annotate_ids(["chr2:1:A:G"])[0]
    assert a.variant_id == "chr2:1:A:G"
    assert a.gene is None and a.af is None
    assert all(not m.present for m in s.db_status())


# ---- source parsers (tiny inline fixtures) --------------------------------


def test_parse_clinvar_vcf(tmp_path):
    f = tmp_path / "clinvar.vcf"
    f.write_text(
        "##fileformat=VCFv4.1\n"
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n"
        "2\t166277081\t12345\tA\tG\t.\t.\tALLELEID=1;CLNSIG=Pathogenic;CLNREVSTAT=criteria_provided;GENEINFO=SCN1A:6323\n"
    )
    rows = list(parse_clinvar_vcf(str(f)))
    assert rows == [("2", 166277081, "A", "G", "Pathogenic", "criteria_provided", "SCN1A")]


def test_parse_gnomad_vcf_multiallelic(tmp_path):
    f = tmp_path / "gnomad.vcf"
    f.write_text(
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n"
        "1\t11790000\t.\tG\tA,T\t.\t.\tAF=0.002,0.01;AF_grpmax=0.015\n"
    )
    rows = list(parse_gnomad_vcf(str(f)))
    assert rows == [
        ("1", 11790000, "G", "A", 0.002, 0.015),
        ("1", 11790000, "G", "T", 0.01, 0.015),
    ]


def test_parse_cadd_tsv(tmp_path):
    f = tmp_path / "cadd.tsv"
    f.write_text(
        "## comment\n"
        "#Chrom\tPos\tRef\tAlt\tRawScore\tPHRED\n"
        "2\t166277081\tA\tG\t4.21\t28.5\n"
    )
    rows = list(parse_cadd_tsv(str(f)))
    assert rows == [("2", 166277081, "A", "G", 28.5, "CADD")]
