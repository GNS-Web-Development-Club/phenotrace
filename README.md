# PhenoTrace

PhenoTrace is a local-first, phenotype-driven variant triage tool by Bryan Cheng. A
clinician describes a patient's symptoms in free text; PhenoTrace maps the description
to HPO terms and ranks the variants in the patient's VCF by how likely each is to be
causal, with every ranking shown as a sum of named, weighted factors (gene-phenotype
association, pathogenicity, rarity, inheritance fit) that can be re-weighted live. The
backend is FastAPI bound to loopback, so no patient data leaves the machine; the UI is a
Vite + React SPA styled as a pathology requisition worksheet.

> **Decision-support & research tool — not a diagnostic device.** Rankings are
> hypotheses to investigate, not clinical conclusions.

## Demo

A static demo (no Python) is built with `VITE_DEMO=1`:

```bash
cd frontend && VITE_DEMO=1 npm run build     # PowerShell: $env:VITE_DEMO='1'; npm run build
npx vite preview
```

`vercel.json` at the repo root sets that variable, so the repository deploys to Vercel as
the demo. In demo mode `frontend/src/lib/api.ts` swaps the `/api` client for
`frontend/src/demo/api.ts`, which answers every call from JSON recorded against the real
backend (`frontend/src/demo/data/`): the three sample cases, their variant pages and
annotations, HPO mapping and search results, database status, default weights and the
default-weight reports. Open `/?case=epilepsy` (or `cystic_fibrosis`,
`hypercholesterolemia`) to land with a case already loaded and scored.

What is live in the demo and what is not:

- Weight sliders, pre-filter, top-N and the inheritance model re-score in the browser.
  Each recorded factor carries its raw value, so `composite = sum(raw x weight)` is
  recomputed exactly as the engine does; the inheritance factor was recorded for every
  selectable model.
- Gene-phenotype association was recorded for each case's mapped HPO terms. Adding or
  removing terms does not change that factor in the demo.
- Free-text mapping and HPO search are recorded for the case descriptions and a handful
  of queries; other input falls back to a substring match over the recorded vocabulary.
- CSV export is generated from the live ranking; the HTML report is the backend's
  default-weight report for the case.
- VCF upload is disabled; the demo points to this repository for the local app.

The normal build (`npm run build` without `VITE_DEMO`) is unchanged and is served by
the Python backend as before.

## Status — all phases complete

- ✅ **Phase 1** — streaming VCF ingestion + virtualized variant table
- ✅ **Phase 2** — local annotation databases (gnomAD / ClinVar / pathogenicity / gene-map)
- ✅ **Phase 3** — HPO mapping from clinical text (lexical + synonyms + lay terms)
- ✅ **Phase 4** — transparent, fully-decomposed scoring engine
- ✅ **Phase 5** — ranked results + explanation panel + live weight sliders + CSV/HTML export
- ✅ **Phase 6** — tests, privacy audit, perf pass, packaging ([PACKAGING.md](./PACKAGING.md))

Full end-to-end run works: drop a VCF → type symptoms → confirm HPO terms → ranked
variants with factor-by-factor breakdowns → export a reproducible report.

### Quality bar

- **62 tests** pass (`python -m pytest`): VCF parsing (malformed/multiallelic/missing-GT/
  gzip), annotation lookups, HPO matcher, scoring factor-math + golden pipeline, API,
  and a **privacy audit** that fails CI if any runtime module imports network code.
- **Performance** (`python tools/bench.py`): streaming ingest ~117k variants/s, scoring
  ~17k variants/s, and **flat memory** (~2 MB peak) regardless of VCF size — sub-second
  for typical filtered clinical VCFs.

## Requirements

- Python 3.10+ (3.12 recommended)
- Node 18+ / npm

## Install

```bash
pip install -r requirements.txt
npm --prefix frontend install
```

## Run

**Production-style (one process serves API + UI):**

```bash
npm --prefix frontend run build
python run.py            # opens http://127.0.0.1:8765/
```

**Development (hot-reload UI):** two terminals —

```bash
# terminal 1 — backend
PYTHONPATH=backend python -m phenotrace.main      # http://127.0.0.1:8765

# terminal 2 — frontend (proxies /api to the backend)
npm --prefix frontend run dev                     # http://localhost:5173
```

On Windows PowerShell, set the env var with `$env:PYTHONPATH='backend'` first.

## Test

```bash
python -m pytest
```

## Privacy

The server binds only to loopback and refuses any other host. The single permitted
outbound network action is the explicit "download databases" step (Phase 2). Patient
VCFs are read locally and never transmitted.

## Authors

Bryan Cheng
