"""Paths, constants, and tunable defaults.

Kept dependency-free so any module (including the offline db-builder and the
test suite) can import it without pulling in FastAPI.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "PhenoTrace"

# Local-only network binding. The server must never bind to a non-loopback
# interface — patient data stays on the machine. main.py asserts this.
HOST = "127.0.0.1"
PORT = 8765

# How many variant rows the load summary returns inline for an instant preview.
SUMMARY_PREVIEW_ROWS = 50

# Single combined annotation database (tables: gnomad, clinvar, pathogenicity,
# gene_map, meta). One file is simpler to ship, version, and open read-only than
# four; per-source provenance lives in the `meta` table.
ANNOTATION_DB = "annotations.sqlite"

# HPO data files (bundled/fetched once; small enough to live beside the app).
HPO_JSON = "hp.json"
GENES_TO_PHENOTYPE = "genes_to_phenotype.txt"
PHENOTYPE_TO_GENES = "phenotype_to_genes.txt"


def _repo_root() -> Path:
    # backend/phenotrace/config.py -> parents[2] == repo root
    return Path(__file__).resolve().parents[2]


def _resource_base() -> Path:
    """Base dir for bundled, read-only resources (frontend dist, fixtures).

    Under a PyInstaller one-file build these live in the extraction dir
    (``sys._MEIPASS``); otherwise they're at the repo root.
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return _repo_root()


def app_data_dir() -> Path:
    """Per-user writable app dir (databases, HPO data, session scratch)."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    d = Path(base) / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sub(name: str) -> Path:
    d = app_data_dir() / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def databases_dir() -> Path:
    return _sub("databases")


def hpo_dir() -> Path:
    return _sub("hpo")


def sessions_dir() -> Path:
    return _sub("sessions")


def annotation_db_path() -> Path:
    return databases_dir() / ANNOTATION_DB


def session_db_path() -> Path:
    return sessions_dir() / "session.sqlite"


def frontend_dist() -> Path:
    """Built SPA, served by FastAPI in production (absent during `vite dev`)."""
    return _resource_base() / "frontend" / "dist"


# Bundled fallbacks (committed to the repo) used when the app-data copies are
# absent — lets the tool run out-of-the-box for development and tests.
def bundled_dir() -> Path:
    return _resource_base() / "data"


def sample_vcf_path() -> Path:
    """Small bundled fixture VCF, for the UI's 'Load sample' affordance."""
    return _resource_base() / "fixtures" / "sample.vcf"
