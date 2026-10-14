"""Pure-Python streaming VCF 4.2/4.3 parser.

Design constraints (from PLAN.md):
  * Stream, don't slurp. This module never builds a list of all records; it
    yields them one at a time so callers can process arbitrarily large files
    with flat memory.
  * Plain text and bgzipped/gzipped (.vcf.gz) input are both supported.

Multiallelic sites (ALT = "A,T") are split into one record per ALT allele.
Genotype is read from the FIRST sample only (this is a single-patient triage
tool). For an allele the sample does not carry (and the GT is known), no record
is emitted — homozygous-reference and uncarried alts are not variants to triage.
"""
from __future__ import annotations

import gzip
from dataclasses import dataclass
from typing import IO, Iterator, Optional

# ALT placeholders that are not real alternate alleles for triage purposes.
_SKIP_ALTS = {".", "*", ""}


@dataclass
class VcfHeader:
    fileformat: Optional[str] = None
    reference: Optional[str] = None
    samples: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.samples is None:
            self.samples = []


@dataclass
class ParsedVariant:
    chrom: str
    pos: int
    ref: str
    alt: str
    qual: Optional[float]
    filter: str
    genotype: Optional[str]
    zygosity: Optional[str]
    from_multiallelic: bool = False


def open_text(path: str) -> IO[str]:
    """Open a VCF as a text stream, transparently handling gzip."""
    if path.endswith(".gz") or path.endswith(".bgz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def _to_float(s: str) -> Optional[float]:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def read_header(fh: IO[str]) -> tuple[VcfHeader, Optional[str]]:
    """Consume meta/header lines.

    Returns the parsed header and, if the file has no ``#CHROM`` line (headerless
    VCF), the first data line that was read while looking for it (so the caller
    doesn't lose it). gzip text streams aren't reliably seekable, hence the
    look-ahead-return pattern instead of seek/rewind.
    """
    header = VcfHeader()
    for line in fh:
        if line.startswith("##"):
            body = line[2:].strip()
            if body.startswith("fileformat="):
                header.fileformat = body.split("=", 1)[1]
            elif body.startswith("reference="):
                header.reference = body.split("=", 1)[1]
            continue
        if line.startswith("#CHROM"):
            cols = line.rstrip("\n").rstrip("\r").split("\t")
            if len(cols) > 9:
                header.samples = cols[9:]
            return header, None
        if line.startswith("#"):  # any other comment
            continue
        # A data line before #CHROM: headerless VCF. Hand the line back.
        return header, line
    return header, None


def _allele_state(gt: str, alt_index: int) -> tuple[Optional[bool], Optional[str]]:
    """Given a sample GT string and a 1-based ALT index, return
    (carried, zygosity).

    carried is True/False when the genotype is informative, or None when it is
    unknown (all alleles missing). zygosity is one of het/hom/hemi or None.
    """
    raw = gt.replace("|", "/").split("/")
    alleles: list[Optional[int]] = []
    for token in raw:
        token = token.strip()
        if token == "" :
            continue
        if token == ".":
            alleles.append(None)
        else:
            try:
                alleles.append(int(token))
            except ValueError:
                alleles.append(None)
    present = [a for a in alleles if a is not None]
    if not present:
        return None, None  # genotype unknown
    count = present.count(alt_index)
    if count == 0:
        return False, None
    ploidy = len(alleles)
    if ploidy <= 1:
        return True, "hemi"
    if count >= 2:
        return True, "hom"
    return True, "het"


def _parse_line(line: str) -> Iterator[ParsedVariant]:
    line = line.rstrip("\n").rstrip("\r")
    if not line:
        return
    cols = line.split("\t")
    if len(cols) < 8:
        return  # malformed; caller counts skips by diffing if it cares
    chrom, pos_s, _id, ref, alt_field, qual_s, filt = cols[:7]
    try:
        pos = int(pos_s)
    except ValueError:
        return
    qual = None if qual_s in (".", "") else _to_float(qual_s)
    filt = filt if filt else "."

    gt: Optional[str] = None
    if len(cols) > 9 and cols[8]:
        fmt = cols[8].split(":")
        sample = cols[9].split(":")
        if "GT" in fmt:
            gi = fmt.index("GT")
            if gi < len(sample):
                gt = sample[gi]

    alts = alt_field.split(",")
    multi = len([a for a in alts if a not in _SKIP_ALTS]) > 1
    for i, alt in enumerate(alts, start=1):
        if alt in _SKIP_ALTS:
            continue
        zyg: Optional[str] = None
        if gt is not None:
            carried, zyg = _allele_state(gt, i)
            if carried is False:
                continue  # sample doesn't carry this alt
        yield ParsedVariant(
            chrom=chrom,
            pos=pos,
            ref=ref,
            alt=alt,
            qual=qual,
            filter=filt,
            genotype=gt,
            zygosity=zyg,
            from_multiallelic=multi,
        )


def iter_records(fh: IO[str], first_line: Optional[str] = None) -> Iterator[ParsedVariant]:
    """Yield ParsedVariant records from an open, header-consumed text stream."""
    if first_line is not None:
        yield from _parse_line(first_line)
    for line in fh:
        if not line or line[0] == "#":
            continue
        yield from _parse_line(line)


def parse_file(path: str) -> tuple[VcfHeader, Iterator[ParsedVariant]]:
    """Convenience: open a file, read its header, return (header, record-iterator).

    The iterator owns the file handle; exhaust it (or close via a `with` around
    open_text in the caller) to release the descriptor.
    """
    fh = open_text(path)
    header, first = read_header(fh)
    return header, iter_records(fh, first)
