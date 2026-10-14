import { useEffect, useRef, useState } from "react";
import type { PreFilter, ScoreRequest, ScoreResult, Weights } from "../lib/types";
import { api, downloadBlob, IS_DEMO } from "../lib/api";
import { WeightControls } from "./WeightControls";
import { ResultsList } from "./ResultsList";
import { ExplanationPanel } from "./ExplanationPanel";
import { ChromosomeMap } from "./viz/ChromosomeMap";

const DEFAULT_WEIGHTS: Weights = {
  gene_phenotype: 0.45,
  pathogenicity: 0.25,
  rarity: 0.2,
  inheritance: 0.1,
};
const DEFAULT_PREFILTER: PreFilter = { max_af: 0.05, drop_non_pass: true, enabled: true };

export function ResultsSection({ termIds }: { termIds: string[] }) {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [prefilter, setPrefilter] = useState<PreFilter>(DEFAULT_PREFILTER);
  const [inheritance, setInheritance] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const request = (): ScoreRequest => ({
    query: { term_ids: termIds, inheritance: inheritance || null },
    weights,
    prefilter,
    top_n: 100,
  });

  // Live re-score (debounced) whenever inputs change.
  useEffect(() => {
    if (termIds.length === 0) return;
    let cancelled = false;
    const id = setTimeout(() => {
      setScoring(true);
      setError("");
      api
        .scoreVariants(request())
        .then((res) => {
          if (cancelled) return;
          setResult(res);
          const keep = res.results.some((r) => r.variant.id === selRef.current);
          if (!keep) setSelectedId(res.results[0]?.variant.id ?? null);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !cancelled && setScoring(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termIds.join(","), weights, prefilter, inheritance]);

  const doExport = async (format: "csv" | "html") => {
    setExporting(true);
    try {
      const blob = await api.exportReport(request(), format);
      downloadBlob(blob, `phenotrace_report.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const selected = result?.results.find((r) => r.variant.id === selectedId) ?? null;
  const exportDisabled = exporting || !result || result.results.length === 0;
  const maxComposite = Math.max(0.0001, ...(result?.results.map((r) => r.breakdown.composite) ?? [0]));

  return (
    <div className="flex flex-col gap-4">
      <WeightControls
        weights={weights}
        prefilter={prefilter}
        inheritance={inheritance}
        onWeights={setWeights}
        onPrefilter={setPrefilter}
        onInheritance={setInheritance}
      />

      <div className="sheet flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <span aria-live="polite">
          {scoring ? (
            "Scoring"
          ) : result ? (
            <>
              Ranked <span className="font-mono font-medium">{result.results.length}</span> variants.
              Re-scores as you move the sliders.
            </>
          ) : (
            "Waiting for the first score."
          )}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void doExport("csv")} disabled={exportDisabled} className="btn btn-ruled btn-sm">
            Export CSV
          </button>
          <button type="button" onClick={() => void doExport("html")} disabled={exportDisabled} className="btn btn-sm">
            {exporting ? "Preparing" : "Export HTML report"}
          </button>
        </div>
        {IS_DEMO && (
          <span className="basis-full text-[0.875rem] text-ink-2">
            Demo: the CSV reflects the sliders; the HTML report is the recorded default-weight
            report for this case. Gene-phenotype association uses the case's recorded terms.
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 border border-stamp bg-stamp-tint px-4 py-3 text-[0.95rem] text-stamp">
          <span className="font-slab font-bold">Scoring error</span>
          <span className="font-mono">{error}</span>
        </div>
      )}

      {result && result.results.length > 0 && (
        <ChromosomeMap results={result.results} max={maxComposite} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      {result && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <div className="flex max-h-[min(60vh,32rem)] flex-col lg:max-h-[64vh]">
              <ResultsList result={result} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <ExplanationPanel sv={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
