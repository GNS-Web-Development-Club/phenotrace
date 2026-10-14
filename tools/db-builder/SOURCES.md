# Annotation data sources

PhenoTrace ships with **sample/development data only** (see `make_sample_dbs.py`).
To build real databases, download the frozen snapshots below and run `build_db.py`.
Record the snapshot date you downloaded — it is shown in the app as a "last updated"
badge, and PhenoTrace never implies the data is live.

> All downloads are done **by you, offline of the app**. The PhenoTrace runtime
> performs no network I/O except the single explicit "download databases" action.

## gnomAD — population allele frequencies

- **What:** allele frequencies keyed by `(chrom, pos, ref, alt)`; `popmax`/`grpmax`.
- **Source:** https://gnomad.broadinstitute.org/downloads (VCF sites files).
- **Note:** the full set is very large. v1 expects a **subset** (e.g. exome sites,
  or selected chromosomes). The schema and lookups are identical for a fuller DB —
  swap the file and rebuild.
- **Builder flag:** `--gnomad <sites.vcf.bgz> --gnomad-date YYYY-MM-DD`
- **INFO keys read:** `AF` (per-allele), and popmax via `AF_grpmax`/`AF_popmax`/`grpmax`.

## ClinVar — clinical significance

- **What:** `CLNSIG`, `CLNREVSTAT`, gene (`GENEINFO`), keyed by locus.
- **Source:** https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz
  (also `clinvar.vcf.gz.md5` for checksum verification).
- **Builder flag:** `--clinvar clinvar.vcf.gz --clinvar-date YYYY-MM-DD`

## Pathogenicity scores — precomputed (CADD / AlphaMissense)

- **What:** precomputed deleteriousness score per variant (a *lookup*, never a live
  API call).
- **CADD:** https://cadd.gs.washington.edu/download — `whole_genome_SNVs.tsv.gz`
  (columns: `#Chrom Pos Ref Alt RawScore PHRED`; PhenoTrace stores PHRED).
- **AlphaMissense:** https://zenodo.org/records/8208688 — convert to the same
  4-key + score TSV layout if used instead.
- **Builder flag:** `--cadd whole_genome_SNVs.tsv.gz --cadd-date YYYY-MM-DD`

## Gene / consequence mapping

- **What:** variant → gene + predicted consequence + severity rank.
- **How (v1, recommended):** precompute offline with VEP or snpEff, then emit a TSV:
  `chrom  pos  ref  alt  gene  consequence  consequence_rank`
  (`consequence` should be one of the keys in
  `backend/phenotrace/annotation/consequence.py`; `consequence_rank` may be left
  blank to let the app derive it).
- **VEP:** https://www.ensembl.org/info/docs/tools/vep/
- **snpEff:** https://pcingola.github.io/SnpEff/
- **Builder flag:** `--gene-map gene_map.tsv --gene-map-date YYYY-MM-DD`

## Output

A single `annotations.sqlite` with tables `gnomad`, `clinvar`, `pathogenicity`,
`gene_map`, and a `meta` table recording `(source, version, snapshot_date,
row_count, is_sample)`. Indexes on `(chrom, pos, ref, alt)` and `ANALYZE` are
always applied. Default output path is the per-user app-data dir
(`%LOCALAPPDATA%/PhenoTrace/databases/annotations.sqlite` on Windows).
