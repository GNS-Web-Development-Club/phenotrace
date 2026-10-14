from __future__ import annotations

import gzip
import os

import pytest

from phenotrace.vcf.parser import _allele_state, parse_file
from phenotrace.vcf.store import VcfSession


def _collect(path: str):
    header, records = parse_file(path)
    return header, list(records)


def test_parse_counts_and_header(sample_vcf):
    header, recs = _collect(sample_vcf)
    assert header.fileformat == "VCFv4.2"
    assert header.reference == "GRCh38"
    assert header.samples == ["PATIENT01"]
    # 12 emitted alleles: hom-ref skipped, '*' skipped, multiallelic split.
    assert len(recs) == 12
    assert sum(1 for r in recs if r.from_multiallelic) == 2


def test_multiallelic_split(sample_vcf):
    _, recs = _collect(sample_vcf)
    chr1 = [r for r in recs if r.chrom == "chr1" and r.pos == 11790000]
    assert {r.alt for r in chr1} == {"A", "T"}
    assert all(r.zygosity == "het" for r in chr1)


def test_homref_and_spanning_deletion_skipped(sample_vcf):
    _, recs = _collect(sample_vcf)
    # hom-ref site (chr3:100000) yields nothing.
    assert not [r for r in recs if r.chrom == "chr3" and r.pos == 100000]
    # spanning deletion '*' at chr3:300000 dropped; only G->GA remains.
    chr3_300k = [r for r in recs if r.chrom == "chr3" and r.pos == 300000]
    assert [r.alt for r in chr3_300k] == ["GA"]


def test_missing_genotype_emitted_with_unknown_zygosity(sample_vcf):
    _, recs = _collect(sample_vcf)
    miss = [r for r in recs if r.chrom == "chr3" and r.pos == 200000]
    assert len(miss) == 1
    assert miss[0].zygosity is None


def test_hemizygous(sample_vcf):
    _, recs = _collect(sample_vcf)
    x = [r for r in recs if r.chrom == "chrX"]
    assert len(x) == 1 and x[0].zygosity == "hemi"


def test_qual_and_filter(sample_vcf):
    _, recs = _collect(sample_vcf)
    qdot = [r for r in recs if r.chrom == "chr12" and r.pos == 25245350]
    assert qdot[0].qual is None
    lowq = [r for r in recs if r.chrom == "chr7"]
    assert lowq[0].filter == "LowQual"


@pytest.mark.parametrize(
    "gt,idx,expected",
    [
        ("0/1", 1, (True, "het")),
        ("1/1", 1, (True, "hom")),
        ("1|0", 1, (True, "het")),
        ("0/0", 1, (False, None)),
        ("1/2", 2, (True, "het")),
        ("1/2", 1, (True, "het")),
        ("./.", 1, (None, None)),
        ("1", 1, (True, "hemi")),
        ("0", 1, (False, None)),
    ],
)
def test_allele_state(gt, idx, expected):
    assert _allele_state(gt, idx) == expected


def test_session_roundtrip_and_pagination(sample_vcf, tmp_path):
    sess = VcfSession(str(tmp_path / "session.sqlite"))
    summary = sess.load(sample_vcf)
    assert summary.total_variants == 12
    assert summary.multiallelic_records == 2
    assert summary.sample_name == "PATIENT01"
    assert len(summary.first_variants) == 12
    assert sess.total() == 12

    page1 = sess.page(0, 5)
    page2 = sess.page(5, 5)
    assert [v.row for v in page1] == [1, 2, 3, 4, 5]
    assert [v.row for v in page2] == [6, 7, 8, 9, 10]
    # ids are canonical chrom:pos:ref:alt
    assert page1[0].id == "chr2:166277081:A:G"


def test_malformed_lines_are_skipped(tmp_path):
    content = (
        "##fileformat=VCFv4.2\n"
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\n"
        "chr1\t100\t.\tA\tG\t50\tPASS\t.\tGT\t0/1\n"  # good
        "chr1\tNOTNUM\t.\tA\tG\t.\t.\t.\tGT\t0/1\n"  # non-integer POS -> skip
        "tooFewColumns\there\n"  # < 8 columns -> skip
        "chr2\t200\t.\tC\t.\t.\t.\t.\tGT\t0/1\n"  # ALT '.' -> skip
        "chr3\t300\t.\tG\tT\t.\t.\t.\tGT\t0/0\n"  # hom-ref -> skip
        "chr4\t400\t.\tT\tC\t.\t.\t.\tGT\t1/1\n"  # good hom
    )
    p = tmp_path / "m.vcf"
    p.write_text(content)
    _, recs = _collect(str(p))
    assert {(r.chrom, r.pos) for r in recs} == {("chr1", 100), ("chr4", 400)}


def test_empty_file_is_handled(tmp_path):
    p = tmp_path / "empty.vcf"
    p.write_text("##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n")
    sess = VcfSession(str(tmp_path / "e.sqlite"))
    summary = sess.load(str(p))
    assert summary.total_variants == 0
    assert sess.page(0, 10) == []


def test_gzip_input(sample_vcf, tmp_path):
    gz = tmp_path / "sample.vcf.gz"
    with open(sample_vcf, "rb") as fin, gzip.open(gz, "wb") as fout:
        fout.write(fin.read())
    sess = VcfSession(str(tmp_path / "s.sqlite"))
    summary = sess.load(str(gz))
    assert summary.total_variants == 12
