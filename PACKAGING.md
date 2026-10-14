# Packaging PhenoTrace

PLAN.md targets a `tauri build` binary under 40 MB. This build uses Python + a web
SPA, so the equivalent is: ship the small SPA bundle + Python backend, optionally
frozen into a single executable. Annotation databases are **never** bundled — they
are built/downloaded into the per-user app-data dir on first run.

## Footprint

- Frontend bundle: ~250 KB JS / ~76 KB gzipped + ~6 KB CSS.
- Backend: pure Python (no compiled extensions beyond stdlib `sqlite3`).
- A PyInstaller one-file build is dominated by the bundled CPython + FastAPI/uvicorn
  (~15–30 MB depending on platform), not by app code.

## Run modes

1. **Browser (simplest):**
   ```bash
   npm --prefix frontend run build
   python run.py            # serves + opens http://127.0.0.1:8765/
   ```
2. **Native window** (uses the system WebView2/WebKit; no Rust toolchain):
   ```bash
   pip install pywebview
   python run.py --window
   ```

## One-file executable (PyInstaller)

The app resolves bundled, read-only resources (`frontend/dist`, `fixtures/`) via
`sys._MEIPASS` when frozen (see `config._resource_base`), so a one-file build works.
Build the SPA first, then:

**Windows** (`;` path separator):
```bat
npm --prefix frontend run build
pyinstaller --noconfirm --onefile --name PhenoTrace ^
  --paths backend ^
  --add-data "frontend/dist;frontend/dist" ^
  --add-data "fixtures/sample.vcf;fixtures" ^
  --collect-submodules uvicorn ^
  --collect-submodules phenotrace ^
  run.py
```

**macOS / Linux** (`:` path separator):
```bash
npm --prefix frontend run build
pyinstaller --noconfirm --onefile --name PhenoTrace \
  --paths backend \
  --add-data "frontend/dist:frontend/dist" \
  --add-data "fixtures/sample.vcf:fixtures" \
  --collect-submodules uvicorn \
  --collect-submodules phenotrace \
  run.py
```

`--collect-submodules uvicorn` pulls in uvicorn's dynamically-imported protocol/
lifespan modules. The resulting `dist/PhenoTrace` launches the loopback server and
opens the UI. Writable state (session DB, downloaded annotation DBs) goes to the
per-user app-data dir, independent of the executable.

> Not executed in this environment — PyInstaller isn't installed here. The resource-
> path handling is wired and tested via `config._resource_base`; run the command
> above on the target OS to produce the binary.

## Code signing / distribution

- **Windows:** sign with `signtool` (Authenticode) to avoid SmartScreen warnings.
- **macOS:** codesign + notarize the `.app`/binary.
- **Linux:** ship the binary or an AppImage.

## What is NOT packaged

- gnomAD / ClinVar / CADD databases (large; built via `tools/db-builder/` or
  installed on first run). This keeps the binary small and the data honestly
  versioned with a visible snapshot date.
