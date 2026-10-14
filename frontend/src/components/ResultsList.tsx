import { useMemo, useRef, useState } from "react";
import type { ScoreResult } from "../lib/types";
import { ScoreDistribution } from "./viz/ScoreDistribution";

interface Props {
  result: ScoreResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ResultsList({ result, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const max = Math.max(0.0001, ...result.results.map((r) => r.breakdown.composite));
  const st = result.stats;
  const prefiltered = st.prefiltered_common + st.prefiltered_non_pass;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const indexed = result.results.map((sv, i) => ({ sv, rank: i }));
    if (!q) return indexed;
    return indexed.filter(
      ({ sv }) =>
        (sv.annotation.gene ?? "").toLowerCase().includes(q) ||
        sv.variant.id.toLowerCase().includes(q),
    );
  }, [result.results, filter]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (shown.length === 0) return;
    e.preventDefault();
    const pos = shown.findIndex((s) => s.sv.variant.id === selectedId);
    const next =
      e.key === "ArrowDown"
        ? Math.min(shown.length - 1, pos < 0 ? 0 : pos + 1)
        : Math.max(0, pos < 0 ? 0 : pos - 1);
    const id = shown[next]?.sv.variant.id;
    if (id) {
      onSelect(id);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-vid="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  };

  return (
    <div className="sheet flex min-h-0 flex-col">
      <div className="sheet-head">
        <span className="sheet-title">Ranked variants</span>
        <span className="sheet-note font-mono">
          {st.returned} of {st.scored} scored, {st.total} total
          {prefiltered > 0 && `, ${prefiltered} pre-filtered`}
        </span>
        {!st.annotations_available && (
          <span className="stamp stamp-violet ml-auto">No annotation DB</span>
        )}
      </div>

      <div className="flex flex-col gap-3 border-b border-rule px-4 py-3">
        <div className="field">
          <label htmlFor="rank-filter" className="field-label">
            Filter by gene or locus
          </label>
          <input id="rank-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="input" autoComplete="off" />
        </div>
        {result.results.length >= 3 && (
          <div>
            <div className="flex items-baseline justify-between text-[0.875rem] text-ink-2">
              <span>Score distribution, rank order</span>
              <span className="font-mono">
                {result.results[0]?.breakdown.composite.toFixed(2)} to{" "}
                {result.results[result.results.length - 1]?.breakdown.composite.toFixed(2)}
              </span>
            </div>
            <ScoreDistribution results={result.results} max={max} selectedId={selectedId} onSelect={onSelect} />
          </div>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-auto outline-none"
        tabIndex={0}
        role="listbox"
        aria-label="Ranked variants; use the arrow keys to move"
        onKeyDown={onKeyDown}
      >
        {shown.length === 0 && (
          <p className="m-0 px-4 py-8 text-center text-ink-2">
            {result.results.length === 0
              ? "No variants passed the pre-filter. Turn it off, or widen the phenotype."
              : `No ranked variant matches "${filter}".`}
          </p>
        )}

        <ul className="m-0 list-none p-0">
          {shown.map(({ sv, rank }) => {
            const selected = sv.variant.id === selectedId;
            const pct = (sv.breakdown.composite / max) * 100;
            return (
              <li key={sv.variant.id} className="ruled-row">
                <button
                  type="button"
                  data-vid={sv.variant.id}
                  onClick={() => onSelect(sv.variant.id)}
                  role="option"
                  aria-selected={selected}
                  aria-label={`Rank ${rank + 1}: ${sv.annotation.gene ?? "unknown gene"}, score ${sv.breakdown.composite.toFixed(3)}`}
                  className="row-btn px-4 py-2.5"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="w-7 shrink-0 font-mono text-[0.95rem] text-ink-2">{rank + 1}.</span>
                    <span className="w-[6rem] shrink-0 truncate font-slab text-[1.1rem] font-semibold italic">
                      {sv.annotation.gene ?? "no gene"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.9rem] text-ink-2">{sv.variant.id}</span>
                    <span className="shrink-0 font-mono font-medium">{sv.breakdown.composite.toFixed(3)}</span>
                  </span>
                  <span className="mt-1.5 block h-[6px] w-full bg-paper-3" aria-hidden="true">
                    <span className={`block h-full ${selected ? "bg-pen" : "bg-ink"}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="mt-1 block truncate text-[0.875rem] leading-snug text-ink-2">{sv.headline}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
