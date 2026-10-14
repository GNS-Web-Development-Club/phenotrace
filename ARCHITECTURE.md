# PhenoTrace — Architecture (Python/web realization of PLAN.md)

PLAN.md specifies a **Tauri 2 (Rust) + React** desktop app. On the build machine,
Rust and a Windows C++ linker (MSVC Build Tools, admin-only) were unavailable, so
by explicit decision v1 is built on the **available toolchain — Python + Node** —
while preserving every hard constraint from the plan. This file records how the
Tauri/Rust design maps onto the Python/web stack and where the two differ.

## Stack

| Concern            | PLAN.md (Tauri/Rust)                     | This build (Python/web)                          |
| ------------------ | ---------------------------------------- | ------------------------------------------------ |
| Shell / window     | Tauri 2 + system WebView2                | FastAPI on `127.0.0.1` serving the SPA; optional `pywebview` native window (WebView2 is present) |
| Backend core       | Rust modules                             | Python package `backend/phenotrace/`             |
| VCF parsing        | `noodles-vcf` streaming                  | Pure-Python streaming parser (`vcf/parser.py`)   |
| Annotation store   | SQLite via `rusqlite`, mmap, indexes     | SQLite via stdlib `sqlite3`, mmap, indexes       |
| Command surface    | Tauri `#[command]` functions             | HTTP endpoints under `/api` (1:1 mapping below)  |
| Frontend           | React + TS + Vite + Tailwind             | identical                                        |
| HPO mapping v1     | lexical + synonym, bundled               | identical (Python)                               |

## Hard constraints — how each is honored

- **Local-only.** The server binds strictly to loopback; `main.py` raises if asked
  to bind anything but `127.0.0.1`/`localhost`/`::1`. The VCF is read directly from
  the local path (or streamed to a local temp file on browser upload) and never
  transmitted anywhere. The *only* outbound network action is the explicit
  database-update endpoint (Phase 2).
- **Memory-light.** The VCF is never slurped. `vcf/parser.py` yields one record at a
  time; `vcf/store.py` stream-writes them into an on-disk per-session SQLite table in
  fixed-size batches. Reads (table pagination, scoring) use server-side cursors.
- **Disk-light.** No annotation DBs are bundled; they are built/downloaded into the
  per-user app-data dir. The frontend bundle is ~70 KB gzipped.
- **Transparent scoring.** Every score is a sum of named, weighted factors, each with
  a raw value and a human-readable reason (`models.ScoreBreakdown`, Phase 4).
- **Frozen-snapshot honesty.** Each annotation source carries `(version, snapshot_date,
  row_count)` in a `meta` table, surfaced as a "last updated" badge.

## Command surface ↔ endpoints

| PLAN.md command                       | Endpoint                              | Status   |
| ------------------------------------- | ------------------------------------- | -------- |
| `load_vcf(path) -> VcfSummary`        | `POST /api/load_vcf`                  | Phase 1 ✅ |
| (browser upload variant)              | `POST /api/load_vcf_upload`           | Phase 1 ✅ |
| `get_variants(offset, limit)`         | `GET /api/variants`                   | Phase 1 ✅ |
| `annotate_variants(ids)`              | `POST /api/annotate`                  | Phase 2  |
| `map_phenotype(text)`                 | `POST /api/map_phenotype`             | Phase 3  |
| `search_hpo(query)`                   | `GET /api/search_hpo`                 | Phase 3  |
| `score_variants(query, weights)`      | `POST /api/score_variants`            | Phase 4  |
| `db_status() -> [DbMeta]`             | `GET /api/db_status`                  | Phase 2  |
| `download_databases()` (only network) | `POST /api/download_databases`        | Phase 2  |
| `export_report(results, format)`      | `POST /api/export_report`             | Phase 5  |

## Layout

```
PhenoTrace/
  backend/phenotrace/
    config.py        # paths, app-data dir, constants
    models.py        # pydantic contract (mirrored by frontend/src/lib/types.ts)
    state.py         # process-wide singleton (loaded VCF, opened DBs)
    main.py          # FastAPI app, loopback guard, serves SPA
    api/routes.py    # the endpoint surface
    vcf/             # streaming parser + on-disk session store
    annotation/      # SQLite lookups (Phase 2)
    hpo/             # vocabulary + matcher (Phase 3)
    scoring/         # transparent engine (Phase 4)
    export/          # CSV/HTML report (Phase 5)
  backend/tests/     # pytest
  frontend/          # React + TS + Vite + Tailwind SPA
  tools/db-builder/  # offline SQLite construction + SOURCES.md (Phase 2)
  fixtures/          # sample.vcf + expected outputs
  run.py             # launcher (uvicorn + optional browser/pywebview)
```

## Differences from the plan worth knowing

- The desktop "window" is a loopback web app, not a compiled binary. A `pywebview`
  wrapper (commented in `requirements.txt`) gives a native window using the
  already-installed WebView2 without changing any application code.
- The `< 40 MB binary` target is Tauri-specific. The equivalent here is a small SPA
  bundle plus a Python runtime; no large assets are shipped.
- The optional v2 semantic HPO matcher (ONNX) remains additive and unbuilt in v1,
  exactly as the plan scopes it.
