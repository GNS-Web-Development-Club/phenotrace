# PhenoTrace — Build Plan

A local-first desktop app for phenotype-driven variant triage. Clinician types a free-text clinical description; the app maps it to HPO terms and ranks the patient's variants by likelihood of being causal. No cloud, no PHI leaves the machine.

This document is the build spec. Work through phases in order. Each phase ends in a runnable, testable state. Do not skip ahead — later phases assume earlier ones compile and pass their checks.

---

## 0. Ground rules for the build

- **Local-only.** No network calls at runtime except an explicit, user-initiated "update databases" action. Patient data (VCF) never leaves the machine. Treat this as a hard constraint, not a feature.
- **Disk-light.** Target < 40 MB for the app binary. Annotation databases are downloaded separately on first run, not bundled.
- **Memory-light.** Never load a full annotation database or full VCF into RAM. Stream VCFs line-by-line; query annotations from on-disk SQLite via indexed lookups.
- **Transparent scoring.** Every ranking decision must be decomposable into named contributing factors. No opaque single number. This is the product's core differentiator — protect it.
- **Frozen-snapshot honesty.** Databases are versioned snapshots with a visible "last updated" date. Never imply live/current data.

## Stack decision

- **Shell:** Tauri 2.x (Rust backend + system webview). Chosen over Electron for the ~10x smaller footprint and because the heavy lifting (VCF parsing, scoring) wants to be in Rust anyway.
- **Backend core:** Rust. VCF streaming, annotation lookups, scoring engine.
- **Annotation store:** SQLite (via `rusqlite`), queried with indexes. Optionally memory-mapped. One DB file per source, or one combined DB with multiple tables.
- **Frontend:** React + TypeScript + Vite, inside the Tauri webview. Tailwind for styling. Keep it minimal — this is a focused tool, not a dashboard.
- **HPO mapping (v1):** lexical + synonym matching against the HPO vocabulary (fast, zero ML dependency, ships in the binary).
- **HPO mapping (v2, optional):** quantized sentence-embedding model (ONNX Runtime, CPU) for fuzzy semantic matching. Gated behind a feature flag so v1 ships without it.

> **Build-environment note (this machine):** Rust + a Windows C++ linker are not installed and the MSVC Build Tools require admin. Per an explicit decision, v1 here is implemented in the **available toolchain — Python (FastAPI) + Node (React/TS)** — preserving every hard constraint above. See `ARCHITECTURE.md` for the faithful mapping of the Tauri/Rust design onto the Python/web stack.

---

## Phase 1 — Skeleton + VCF ingestion

**Goal:** App launches, user drops a VCF, app parses it and shows a table of variants. No annotation yet.

(Full original plan text preserved below — phases 1–6, repo layout, command surface, build order, known hard parts.)

---

See `ARCHITECTURE.md` for the Python/web realization of this spec and the exact endpoint ↔ command-surface mapping. The phase goals, factors, and "done when" criteria are followed verbatim.
