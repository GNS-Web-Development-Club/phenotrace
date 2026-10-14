import { useMemo, useRef, useState } from "react";
import type { ScoreResult } from "../lib/types";
import { ScoreDistribution } from "./viz/ScoreDistribution";

interface Props {
  result: ScoreResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const GRID =
  "grid grid-flow-dense grid-cols-[2.4rem_1fr_4.5rem] items-baseline gap-x-3 sm:grid-cols-[2.4rem_minmax(5rem,8rem)_1fr_4.5rem]";

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
    <div className="sect">
      <h3 className="subhead">
        Ranked variants
        <span className="head-note">
          {st.returned} of {st.scored} scored, {st.total} total
          {prefiltered > 0 && `, ${prefiltered} pre-filtered`}
        </span>
      </h3>
      {!st.annotations_available && (
        <p className="note mt-1">No annotation database is installed; only file-level factors are scored.</p>
      )}

      {result.results.length >= 3 && (
        <div className="mt-4">
          <ScoreDistribution results={result.results} max={max} selectedId={selectedId} onSelect={onSelect} />
        </div>
      )}

      <div className="mt-5 flex max-w-md flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.95rem]">
        <label htmlFor="rank-filter" className="shrink-0 text-ink-2">
          Filter by gene or locus
        </label>
        <input
          id="rank-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input min-w-0 flex-1 text-[0.95rem]"
          autoComplete="off"
        />
      </div>

      <div
        ref={listRef}
        className="mt-4 max-h-[40rem] overflow-auto outline-none"
        tabIndex={0}
        role="listbox"
        aria-label="Ranked variants; use the arrow keys to move"
        onKeyDown={onKeyDown}
      >
        <div className={`${GRID} rule-head py-1.5 text-[0.9rem] font-medium text-ink-2`}>
          <span className="text-right">Rank</span>
          <span>Gene</span>
          <span className="hidden sm:block">Locus and reason</span>
          <span className="text-right">Score</span>
        </div>

        {shown.length === 0 && (
          <p className="py-8 text-center text-ink-2">
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
                  className={`row-btn ${GRID} py-2 pl-2`}
                >
                  <span className="block text-right font-mono text-[0.95rem] text-ink-2">{rank + 1}</span>
                  <span className={`block truncate font-slab text-[1.15rem] font-semibold italic ${selected ? "text-pen" : ""}`}>
                    {sv.annotation.gene ?? "no gene"}
                  </span>
                  <span className="col-span-2 col-start-2 block min-w-0 sm:col-span-1 sm:col-start-auto">
                    <span className="block truncate font-mono text-[0.95rem]">{sv.variant.id}</span>
                    <span className="block text-[0.95rem] leading-snug text-ink-2 sm:truncate">{sv.headline}</span>
                  </span>
                  <span className="block text-right">
                    <span className="block font-mono text-[1.05rem] font-medium">{sv.breakdown.composite.toFixed(3)}</span>
                    <span className="mt-1 ml-auto block h-px bg-ink" style={{ width: `${pct}%` }} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
