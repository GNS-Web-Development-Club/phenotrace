"""Parsers for real annotation source files + a builder that turns them into the
combined SQLite DB.

These run **offline** in the db-builder; they never touch the network. The CLI
wrapper lives at ``tools/db-builder/build_db.py``. Kept in-package so the parsers
are unit-testable.

Supported inputs (frozen snapshots downloaded by the user — see SOURCES.md):
  * ClinVar VCF        (clinvar.vcf.gz)         -> clinvar table
  * gnomAD sites VCF   (gnomad.*.sites.vcf.bgz) -> gnomad table
  * CADD TSV           (whole_genome_SNVs.tsv.gz) -> pathogenicity table
  * gene-map TSV       (precomputed VEP/snpEff)  -> gene_map table
"""
from __future__ import annotations

from typing import Iterator, Optional

from ..vcf.parser import open_text
from .schema import build_database


def _to_float(s: Optional[str]) -> Optional[float]:
    if s is None or s in (".", ""):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _info_dict(info: str) -> dict[str, str | bool]:
    out: dict[str, str | bool] = {}
    for kv in info.split(";"):
        if not kv:
            continue
        if "=" in kv:
            k, v = kv.split("=", 1)
            out[k] = v
        else:
            out[kv] = True
    return out


def parse_clinvar_vcf(path: str) -> Iterator[tuple]:
    """-> (chrom, pos, ref, alt, clnsig, clnrevstat, gene)."""
    with open_text(path) as fh:
        for line in fh:
            if not line or line[0] == "#":
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8:
                continue
            chrom, pos, _id, ref, alt, _q, _f, info = cols[:8]
            d = _info_dict(info)
            clnsig = d.get("CLNSIG")
            clnrev = d.get("CLNREVSTAT")
            gene = None
            gi = d.get("GENEINFO")
            if isinstance(gi, str) and gi:
                gene = gi.split(":")[0]
            try:
                ipos = int(pos)
            except ValueError:
                continue
            for a in alt.split(","):
                if a in (".", "*", ""):
                    continue
                yield (
                    chrom,
                    ipos,
                    ref,
                    a,
                    clnsig if isinstance(clnsig, str) else None,
                    clnrev if isinstance(clnrev, str) else None,
                    gene,
                )


def parse_gnomad_vcf(path: str) -> Iterator[tuple]:
    """-> (chrom, pos, ref, alt, af, popmax_af). Handles per-allele AF arrays and
    the several historical popmax/grpmax INFO key spellings."""
    popmax_keys = ("AF_grpmax", "AF_popmax", "grpmax", "popmax", "AF_POPMAX")
    with open_text(path) as fh:
        for line in fh:
            if not line or line[0] == "#":
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8:
                continue
            chrom, pos, _id, ref, alt, _q, _f, info = cols[:8]
            d = _info_dict(info)
            af_field = d.get("AF")
            afs = af_field.split(",") if isinstance(af_field, str) else []
            popmax = None
            for k in popmax_keys:
                v = d.get(k)
                if isinstance(v, str):
                    popmax = _to_float(v.split(",")[0])
                    break
            try:
                ipos = int(pos)
            except ValueError:
                continue
            for i, a in enumerate(alt.split(",")):
                if a in (".", "*", ""):
                    continue
                this_af = _to_float(afs[i]) if i < len(afs) else None
                yield (chrom, ipos, ref, a, this_af, popmax)


def parse_cadd_tsv(path: str, source: str = "CADD") -> Iterator[tuple]:
    """CADD whole-genome TSV: #Chrom Pos Ref Alt RawScore PHRED.
    -> (chrom, pos, ref, alt, phred, source)."""
    with open_text(path) as fh:
        for line in fh:
            if not line or line[0] == "#":
                continue
            p = line.rstrip("\n").split("\t")
            if len(p) < 6:
                continue
            chrom, pos, ref, alt = p[0], p[1], p[2], p[3]
            try:
                ipos = int(pos)
            except ValueError:
                continue
            yield (chrom, ipos, ref, alt, _to_float(p[5]), source)


def parse_gene_map_tsv(path: str) -> Iterator[tuple]:
    """Precomputed gene-map TSV (header optional):
    chrom  pos  ref  alt  gene  consequence  consequence_rank
    -> matching 7-tuple."""
    with open_text(path) as fh:
        for line in fh:
            if not line.strip() or line.startswith("#"):
                continue
            p = line.rstrip("\n").split("\t")
            if len(p) < 6:
                continue
            chrom, pos, ref, alt, gene, consequence = p[:6]
            if pos.lower() == "pos":  # header row
                continue
            try:
                ipos = int(pos)
            except ValueError:
                continue
            rank = None
            if len(p) >= 7:
                try:
                    rank = int(p[6])
                except ValueError:
                    rank = None
            yield (chrom, ipos, ref, alt, gene or None, consequence or None, rank)


def build_from_sources(
    out_path: str,
    *,
    clinvar: Optional[str] = None,
    gnomad: Optional[str] = None,
    cadd: Optional[str] = None,
    gene_map_tsv: Optional[str] = None,
    meta: Optional[dict[str, dict]] = None,
) -> dict[str, int]:
    return build_database(
        out_path,
        gnomad=parse_gnomad_vcf(gnomad) if gnomad else (),
        clinvar=parse_clinvar_vcf(clinvar) if clinvar else (),
        pathogenicity=parse_cadd_tsv(cadd) if cadd else (),
        gene_map=parse_gene_map_tsv(gene_map_tsv) if gene_map_tsv else (),
        meta=meta or {},
    )
