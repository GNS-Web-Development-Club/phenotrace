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

export function ResultsSection({
  termIds,
  onScored,
}: {
  termIds: string[];
  onScored?: (at: Date) => void;
}) {
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
          onScored?.(new Date());
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

  const selectedIndex = result?.results.findIndex((r) => r.variant.id === selectedId) ?? -1;
  const selected = selectedIndex >= 0 ? result!.results[selectedIndex]! : null;
  const exportDisabled = exporting || !result || result.results.length === 0;
  const maxComposite = Math.max(0.0001, ...(result?.results.map((r) => r.breakdown.composite) ?? [0]));

  return (
    <div>
      <WeightControls
        weights={weights}
        prefilter={prefilter}
        inheritance={inheritance}
        onWeights={setWeights}
        onPrefilter={setPrefilter}
        onInheritance={setInheritance}
      />

      <p className="measure sect" aria-live="polite">
        {scoring ? (
          "Scoring."
        ) : result ? (
          <>
            Ranked <span className="font-mono font-medium">{result.results.length}</span> variants;
            the list re-scores as you move the sliders.
          </>
        ) : (
          "Waiting for the first score."
        )}{" "}
        Export the worksheet as{" "}
        <button type="button" onClick={() => void doExport("csv")} disabled={exportDisabled} className="btn-text">
          CSV
        </button>{" "}
        or an{" "}
        <button type="button" onClick={() => void doExport("html")} disabled={exportDisabled} className="btn-text">
          {exporting ? "HTML report (preparing)" : "HTML report"}
        </button>
        .
        {IS_DEMO && (
          <span className="note block mt-1">
            In the demo the CSV reflects the sliders; the HTML report is the recorded
            default-weight report for this case, and gene-phenotype association uses the case's
            recorded terms.
          </span>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-[0.95rem] text-stamp">
          <span className="font-slab font-bold">Scoring error. </span>
          <span className="font-mono">{error}</span>
        </p>
      )}

      {result && result.results.length > 0 && (
        <div className="sect">
          <ChromosomeMap results={result.results} max={maxComposite} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      )}

      {result && (
        <>
          <ResultsList result={result} selectedId={selectedId} onSelect={setSelectedId} />
          <ExplanationPanel sv={selected} rank={selectedIndex} />
        </>
      )}
    </div>
  );
}
