from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from phenotrace.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_load_and_paginate(client, sample_vcf):
    r = client.post("/api/load_vcf", json={"path": os.path.abspath(sample_vcf)})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["total_variants"] == 12
    assert s["multiallelic_records"] == 2
    assert s["sample_name"] == "PATIENT01"
    assert s["parse_time_ms"] >= 0
    assert len(s["first_variants"]) == 12

    page = client.get("/api/variants", params={"offset": 0, "limit": 3}).json()
    assert [v["row"] for v in page] == [1, 2, 3]
    assert page[0]["id"] == "chr2:166277081:A:G"

    assert client.get("/api/health").json()["vcf_loaded"] is True


def test_load_missing_file_400(client):
    r = client.post("/api/load_vcf", json={"path": "does_not_exist.vcf"})
    assert r.status_code == 400


def test_upload(client, sample_vcf):
    with open(sample_vcf, "rb") as fh:
        r = client.post(
            "/api/load_vcf_upload",
            files={"file": ("sample.vcf", fh, "text/plain")},
        )
    assert r.status_code == 200, r.text
    assert r.json()["total_variants"] == 12


def test_phase2_db_status_install_and_annotate(client, tmp_path, monkeypatch, sample_vcf):
    from phenotrace.annotation.store import AnnotationStore
    from phenotrace import state as state_mod

    # Isolate the annotation DB to a temp path (don't touch app-data).
    monkeypatch.setattr(state_mod.state, "annotations", AnnotationStore(str(tmp_path / "ann.sqlite")))

    # Initially absent.
    metas = client.get("/api/db_status").json()
    assert {m["source"] for m in metas} == {"gnomad", "clinvar", "pathogenicity", "gene_map"}
    assert all(not m["present"] for m in metas)

    # Install (offline, builds the sample DB) — the only network-capable endpoint.
    metas = client.post("/api/download_databases").json()
    present = {m["source"]: m for m in metas if m["present"]}
    assert "clinvar" in present
    assert "SAMPLE DATA" in present["clinvar"]["version"]
    assert present["clinvar"]["snapshot_date"] == "2024-02-01"

    # Load the fixture and annotate its variants.
    client.post("/api/load_vcf", json={"path": os.path.abspath(sample_vcf)})
    page = client.get("/api/variants", params={"offset": 0, "limit": 12}).json()
    anns = client.post("/api/annotate", json={"ids": [v["id"] for v in page]}).json()
    by = {a["variant_id"]: a for a in anns}

    scn1a = by["chr2:166277081:A:G"]
    assert scn1a["gene"] == "SCN1A"
    assert scn1a["clnsig"] == "Pathogenic"
    assert scn1a["pathogenicity_score"] == 28.5
    assert scn1a["af"] is None  # absent from gnomad

    intergenic = by["chr3:200000:T:C"]
    assert intergenic["gene"] is None
    assert intergenic["af"] == 0.30


def test_phase4_score_endpoint(client, tmp_path, monkeypatch, sample_vcf):
    from phenotrace.annotation.store import AnnotationStore
    from phenotrace import state as state_mod

    monkeypatch.setattr(state_mod.state, "annotations", AnnotationStore(str(tmp_path / "ann.sqlite")))
    client.post("/api/download_databases")
    client.post("/api/load_vcf", json={"path": os.path.abspath(sample_vcf)})

    body = {"query": {"term_ids": ["HP:0001250", "HP:0001263", "HP:0001252"], "inheritance": None}}
    r = client.post("/api/score_variants", json=body)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["stats"]["scored"] == 7
    assert res["stats"]["annotations_available"] is True

    top = res["results"][0]
    assert top["annotation"]["gene"] in ("SCN1A", "MECP2")
    comp = top["breakdown"]["composite"]
    assert comp == pytest.approx(sum(f["contribution"] for f in top["breakdown"]["factors"]))
    assert top["headline"]

    # empty phenotype -> 400
    assert client.post("/api/score_variants", json={"query": {"term_ids": []}}).status_code == 400


def test_phase5_export_csv_and_html(client, tmp_path, monkeypatch, sample_vcf):
    from phenotrace.annotation.store import AnnotationStore
    from phenotrace import state as state_mod

    monkeypatch.setattr(state_mod.state, "annotations", AnnotationStore(str(tmp_path / "ann.sqlite")))
    client.post("/api/download_databases")
    client.post("/api/load_vcf", json={"path": os.path.abspath(sample_vcf)})
    body = {"query": {"term_ids": ["HP:0001250", "HP:0001263", "HP:0001252"]}}

    csv_r = client.post("/api/export_report?format=csv", json=body)
    assert csv_r.status_code == 200
    assert "attachment" in csv_r.headers["content-disposition"]
    assert "composite" in csv_r.text and "SCN1A" in csv_r.text

    html_r = client.post("/api/export_report?format=html", json=body)
    assert html_r.status_code == 200
    text = html_r.text
    assert "<html" in text.lower()
    assert "Seizure" in text  # query term label embedded
    assert "SAMPLE DATA" in text  # honesty banner present


def test_phase3_map_phenotype_and_search(client):
    cands = client.post(
        "/api/map_phenotype",
        json={"text": "seizures, developmental delay, low muscle tone"},
    ).json()
    ids = {c["term"]["id"] for c in cands}
    assert {"HP:0001250", "HP:0001263", "HP:0001252"} <= ids

    res = client.get("/api/search_hpo", params={"q": "seiz"}).json()
    assert res[0]["id"] == "HP:0001250"

    info = client.get("/api/hpo_info").json()
    assert info["term_count"] >= 35
    assert info["is_sample"] is True
