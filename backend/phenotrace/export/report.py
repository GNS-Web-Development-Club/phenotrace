"""Export a ScoreResult as CSV or a self-contained, auditable HTML report.

Both formats embed everything needed to reproduce the result: the phenotype
query, the DB snapshot dates (with the SAMPLE warning if applicable), the weights,
and the pre-filter — so a saved result is reproducible and defensible.
"""
from __future__ import annotations

import csv
import html
import io
from typing import Optional

from ..models import DbMeta, HpoTerm, ScoreResult

_DEFAULT_FACTORS = [
    "Gene–phenotype association",
    "Pathogenicity",
    "Rarity",
    "Inheritance fit",
]


def _factor_names(result: ScoreResult) -> list[str]:
    if result.results:
        return [f.name for f in result.results[0].breakdown.factors]
    return _DEFAULT_FACTORS


def to_csv(result: ScoreResult) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    names = _factor_names(result)
    header = [
        "rank", "variant", "gene", "composite", "headline",
        "gnomad_af", "popmax_af", "clinvar", "clinrevstat", "cadd", "consequence",
        "zygosity", "genotype", "filter",
    ]
    for n in names:
        header += [f"{n} | raw", f"{n} | weight", f"{n} | contribution", f"{n} | reason"]
    w.writerow(header)

    for i, sv in enumerate(result.results, start=1):
        a, v, b = sv.annotation, sv.variant, sv.breakdown
        row = [
            i, v.id, a.gene or "", f"{b.composite:.4f}", sv.headline,
            "" if a.af is None else a.af,
            "" if a.popmax_af is None else a.popmax_af,
            a.clnsig or "", a.clnrevstat or "",
            "" if a.pathogenicity_score is None else a.pathogenicity_score,
            a.consequence or "", v.zygosity or "", v.genotype or "", v.filter,
        ]
        for f in b.factors:
            row += ["" if f.raw is None else round(f.raw, 4), f.weight, f.contribution, f.reason]
        w.writerow(row)
    return out.getvalue()


def _e(s: object) -> str:
    return html.escape("" if s is None else str(s))


def to_html(
    result: ScoreResult,
    query_terms: list[HpoTerm],
    db_status: list[DbMeta],
    generated_at: str,
) -> str:
    q = result.query
    w = result.weights
    pf = result.prefilter
    st = result.stats

    is_sample = any("SAMPLE" in (m.version or "") for m in db_status if m.present)
    sample_banner = (
        '<div class="warn"><strong>SAMPLE DATA</strong> — built from development '
        "annotation data, not real gnomAD/ClinVar/CADD. Not for clinical use.</div>"
        if is_sample
        else ""
    )

    term_chips = "".join(
        f'<span class="chip">{_e(t.label)} <code>{_e(t.id)}</code></span>' for t in query_terms
    ) or "<em>none</em>"

    db_rows = "".join(
        f"<tr><td>{_e(m.source)}</td><td>{_e(m.version)}</td>"
        f"<td>{_e(m.snapshot_date)}</td><td>{_e(m.row_count)}</td></tr>"
        for m in db_status
        if m.present
    ) or '<tr><td colspan="4"><em>no annotation databases</em></td></tr>'

    weight_rows = "".join(
        f"<tr><td>{_e(k)}</td><td>{v}</td></tr>"
        for k, v in (
            ("Gene–phenotype", w.gene_phenotype),
            ("Pathogenicity", w.pathogenicity),
            ("Rarity", w.rarity),
            ("Inheritance", w.inheritance),
        )
    )

    rows = []
    for i, sv in enumerate(result.results, start=1):
        a, v, b = sv.annotation, sv.variant, sv.breakdown
        bars = "".join(
            f'<div class="fbar"><span class="flabel">{_e(f.name)}</span>'
            f'<span class="ftrack"><span class="ffill" style="width:{round((f.raw or 0) * 100)}%"></span></span>'
            f'<span class="fnum">{"—" if f.raw is None else round(f.raw, 2)}×{f.weight}='
            f'{f.contribution:.3f}</span>'
            f'<span class="freason">{_e(f.reason)}</span></div>'
            for f in b.factors
        )
        rows.append(
            f"<tr><td class='rank'>{i}</td>"
            f"<td><code>{_e(v.id)}</code><br><span class='gene'>{_e(a.gene or '—')}</span></td>"
            f"<td class='comp'><strong>{b.composite:.3f}</strong></td>"
            f"<td>{_e(sv.headline)}<div class='factors'>{bars}</div></td></tr>"
        )

    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>PhenoTrace report</title>
<style>
 body{{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:1000px;margin:24px auto;padding:0 16px;}}
 h1{{margin:0 0 2px;}} .sub{{color:#64748b;font-size:13px;margin-bottom:16px;}}
 .warn{{background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:8px 12px;border-radius:8px;margin:10px 0;font-size:13px;}}
 .disc{{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:8px 12px;border-radius:8px;margin:10px 0;font-size:13px;}}
 .grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;}}
 .card{{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}}
 .card h3{{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:#64748b;}}
 .chip{{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:2px 8px;margin:2px;font-size:12px;}}
 code{{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#475569;}}
 table{{width:100%;border-collapse:collapse;font-size:13px;}}
 th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;}}
 th{{color:#64748b;font-size:11px;text-transform:uppercase;}}
 .rank{{color:#94a3b8;}} .comp strong{{font-size:15px;}} .gene{{color:#4338ca;font-style:italic;font-size:12px;}}
 .factors{{margin-top:6px;}}
 .fbar{{display:grid;grid-template-columns:170px 120px 130px 1fr;gap:8px;align-items:center;font-size:11px;margin:2px 0;color:#475569;}}
 .ftrack{{background:#f1f5f9;border-radius:4px;height:8px;overflow:hidden;}}
 .ffill{{background:#6366f1;height:8px;display:block;}}
 .fnum{{font-family:ui-monospace,monospace;}} .freason{{color:#64748b;}}
 @media print{{ .factors{{display:block;}} }}
</style></head><body>
<h1>PhenoTrace — variant triage report</h1>
<div class="sub">Generated {_e(generated_at)} · local analysis · {st.scored} scored / {st.total} variants</div>
{sample_banner}
<div class="disc"><strong>Decision-support &amp; research tool — not a diagnostic device.</strong>
 Rankings are hypotheses to investigate, not clinical conclusions.</div>

<div class="grid">
 <div class="card"><h3>Phenotype query</h3>{term_chips}
   <div style="margin-top:6px;font-size:12px;color:#64748b;">Inheritance model: {_e(q.inheritance or 'none')}</div></div>
 <div class="card"><h3>Weights</h3><table>{weight_rows}</table></div>
 <div class="card"><h3>Database snapshots</h3>
   <table><tr><th>Source</th><th>Version</th><th>Snapshot</th><th>Rows</th></tr>{db_rows}</table></div>
 <div class="card"><h3>Pre-filter &amp; counts</h3>
   <div style="font-size:12px;color:#475569;">
     max popmax AF: {pf.max_af} · drop non-PASS: {pf.drop_non_pass} · enabled: {pf.enabled}<br>
     dropped common: {st.prefiltered_common} · dropped non-PASS: {st.prefiltered_non_pass}<br>
     annotations available: {st.annotations_available}
   </div></div>
</div>

<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:#64748b;">Ranked variants</h3>
<table><tr><th>#</th><th>Variant / gene</th><th>Score</th><th>Why (factor breakdown)</th></tr>
{''.join(rows) or '<tr><td colspan=4><em>no variants scored</em></td></tr>'}
</table>
</body></html>"""
