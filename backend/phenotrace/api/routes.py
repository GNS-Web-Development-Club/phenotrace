"""API routes. Maps 1:1 onto PLAN.md's command surface:

    POST /api/load_vcf            -> load_vcf(path) -> VcfSummary
    POST /api/load_vcf_upload     -> load_vcf via browser file upload (streamed)
    GET  /api/variants            -> get_variants(offset, limit) -> [Variant]
    GET  /api/summary             -> current VcfSummary

Later phases add: /api/annotate, /api/map_phenotype, /api/search_hpo,
/api/score_variants, /api/db_status, /api/download_databases, /api/export_report.
"""
from __future__ import annotations

import datetime
import os
import re

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel

from ..config import sample_vcf_path, sessions_dir
from ..models import (
    Annotation,
    DbMeta,
    HpoCandidate,
    HpoTerm,
    PhenotypeQuery,
    PreFilter,
    SampleInfo,
    ScoreResult,
    Variant,
    VcfSummary,
    Weights,
)
from ..sample_library import SAMPLES, sample_path
from ..export.report import to_csv, to_html
from ..scoring.engine import rank_variants
from ..scoring.weights import DEFAULT_PREFILTER, DEFAULT_WEIGHTS
from ..state import state

router = APIRouter(prefix="/api")

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


class LoadVcfRequest(BaseModel):
    path: str


class AnnotateRequest(BaseModel):
    ids: list[str]


class MapPhenotypeRequest(BaseModel):
    text: str


class ScoreRequest(BaseModel):
    query: PhenotypeQuery
    weights: Weights = DEFAULT_WEIGHTS
    prefilter: PreFilter = DEFAULT_PREFILTER
    top_n: int = 50


@router.get("/health")
def health() -> dict:
    return {"ok": True, "vcf_loaded": state.summary is not None}


@router.post("/load_vcf", response_model=VcfSummary)
def load_vcf(req: LoadVcfRequest) -> VcfSummary:
    """Load a VCF already on disk by absolute path (zero-copy; best for huge files)."""
    if not req.path or not os.path.isfile(req.path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.path}")
    try:
        return state.load_vcf(req.path)
    except Exception as exc:  # noqa: BLE001 - surface a clean message to the UI
        raise HTTPException(status_code=422, detail=f"Failed to parse VCF: {exc}") from exc


@router.post("/load_vcf_upload", response_model=VcfSummary)
async def load_vcf_upload(file: UploadFile = File(...)) -> VcfSummary:
    """Load a VCF dropped/picked in the browser. Streamed to a temp file in
    1 MiB chunks (never buffered whole in RAM), then parsed."""
    name = _SAFE.sub("_", os.path.basename(file.filename or "upload.vcf"))
    dest = sessions_dir() / f"upload_{name}"
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    try:
        return state.load_vcf(str(dest))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Failed to parse VCF: {exc}") from exc


@router.get("/samples", response_model=list[SampleInfo])
def list_samples() -> list[SampleInfo]:
    """The bundled, offline demo VCF library (always available)."""
    return [
        SampleInfo(
            id=s.id,
            title=s.title,
            description=s.description,
            phenotype=s.phenotype,
            variants=s.variants,
        )
        for s in SAMPLES
    ]


@router.post("/load_sample", response_model=VcfSummary)
def load_sample(id: str | None = Query(None)) -> VcfSummary:
    """Load a bundled demo VCF. With ``id`` set, loads that named scenario from
    the sample library; otherwise the small default fixture VCF."""
    if id:
        path = sample_path(id)
        if path is None or not path.is_file():
            raise HTTPException(status_code=404, detail=f"Unknown sample: {id}")
        return state.load_vcf(str(path))
    path = sample_vcf_path()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Bundled sample VCF not found")
    return state.load_vcf(str(path))


@router.get("/summary", response_model=VcfSummary)
def summary() -> VcfSummary:
    if state.summary is None:
        raise HTTPException(status_code=400, detail="No VCF loaded")
    return state.summary


@router.get("/variants", response_model=list[Variant])
def get_variants(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
) -> list[Variant]:
    if state.session is None:
        raise HTTPException(status_code=400, detail="No VCF loaded")
    return state.session.page(offset, limit)


# ---- Phase 2: annotation -------------------------------------------------


@router.post("/annotate", response_model=list[Annotation])
def annotate_variants(req: AnnotateRequest) -> list[Annotation]:
    """Enrich a batch of variants (by canonical id) from local DBs. Any field may
    be null when the source has no entry for that locus."""
    return state.annotations.annotate_ids(req.ids)


@router.get("/db_status", response_model=list[DbMeta])
def db_status() -> list[DbMeta]:
    """Per-source provenance for the 'last updated' badge."""
    return state.annotations.db_status()


@router.post("/download_databases", response_model=list[DbMeta])
def download_databases() -> list[DbMeta]:
    """Install annotation databases.

    v1 default: materialize the bundled SAMPLE database locally — NO network I/O.
    This is the single place a real implementation would perform the explicit,
    user-initiated download; it is deliberately the only endpoint permitted to.
    """
    state.ensure_sample_db()
    return state.annotations.db_status()


# ---- Phase 3: HPO mapping -------------------------------------------------


@router.post("/map_phenotype", response_model=list[HpoCandidate])
def map_phenotype(req: MapPhenotypeRequest) -> list[HpoCandidate]:
    """Map free clinical text to candidate HPO terms (editable; not auto-applied)."""
    return state.get_matcher().match(req.text)


@router.get("/search_hpo", response_model=list[HpoTerm])
def search_hpo(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
) -> list[HpoTerm]:
    """Autocomplete over the HPO vocabulary for the term editor."""
    return state.get_hpo().search(q, limit)


@router.get("/hpo_info")
def hpo_info() -> dict:
    vocab = state.get_hpo()
    return {"term_count": len(vocab), "is_sample": vocab.is_sample}


# ---- Phase 4: scoring -----------------------------------------------------


def _compute(req: ScoreRequest) -> ScoreResult:
    if state.session is None:
        raise HTTPException(status_code=400, detail="No VCF loaded")
    if not req.query.term_ids:
        raise HTTPException(
            status_code=400, detail="No phenotype terms — confirm a phenotype query first"
        )
    vocab = state.get_hpo()
    annotated = state.annotations.iter_annotated(state.session.db_path)
    return rank_variants(
        annotated,
        req.query,
        vocab,
        req.weights,
        req.prefilter,
        max(1, min(req.top_n, 500)),
        state.annotations.available(),
    )


@router.post("/score_variants", response_model=ScoreResult)
def score_variants(req: ScoreRequest) -> ScoreResult:
    """Rank variants for the confirmed phenotype query. Each result carries a full
    factor-by-factor breakdown; pre-filter counts are returned for transparency."""
    return _compute(req)


@router.post("/export_report")
def export_report(req: ScoreRequest, format: str = Query("csv", pattern="^(csv|html)$")):
    """Export the ranked shortlist + breakdowns. Recomputed server-side from the
    query/weights so the file is reproducible. Returned as a download."""
    result = _compute(req)
    if format == "csv":
        content = to_csv(result)
        media = "text/csv"
        ext = "csv"
    else:
        vocab = state.get_hpo()
        terms = [vocab.get(t) for t in result.query.term_ids]
        terms = [t for t in terms if t is not None]
        generated = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        content = to_html(result, terms, state.annotations.db_status(), generated)
        media = "text/html"
        ext = "html"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="phenotrace_report.{ext}"'},
    )


@router.get("/default_weights", response_model=Weights)
def default_weights() -> Weights:
    return DEFAULT_WEIGHTS
