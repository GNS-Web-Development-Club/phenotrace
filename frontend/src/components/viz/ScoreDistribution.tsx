import type { ScoredVariant } from "../../lib/types";

interface Props {
  results: ScoredVariant[];
  /** Max composite, for normalising stem heights. */
  max: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Figure: one hairline stem per ranked variant, in rank order, standing on a
 * baseline. The selected variant's stem is drawn in pen.
 */
export function ScoreDistribution({ results, max, selectedId, onSelect }: Props) {
  if (results.length < 3) return null;
  const denom = Math.max(0.0001, max);
  const first = results[0]!.breakdown.composite;
  const last = results[results.length - 1]!.breakdown.composite;

  return (
    <figure className="m-0 max-w-[40rem]">
      <div
        className="flex h-14 w-full items-end border-b border-ink"
        role="group"
        aria-label="Composite-score distribution across ranked variants"
      >
        {results.map((sv, i) => {
          const frac = sv.breakdown.composite / denom;
          const h = Math.max(6, frac * 100);
          const selected = sv.variant.id === selectedId;
          return (
            <button
              key={sv.variant.id}
              type="button"
              onClick={() => onSelect(sv.variant.id)}
              title={`Rank ${i + 1}: ${sv.annotation.gene ?? "no gene"}, ${sv.breakdown.composite.toFixed(3)}`}
              aria-label={`Rank ${i + 1}, ${sv.annotation.gene ?? "unknown gene"}, score ${sv.breakdown.composite.toFixed(3)}`}
              className="flex min-w-0 flex-1 items-end justify-center self-stretch"
            >
              <span className={selected ? "w-[2px] bg-pen" : "w-px bg-ink"} style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[0.875rem] text-ink-2">
        <span>rank 1, {first.toFixed(2)}</span>
        <span>
          rank {results.length}, {last.toFixed(2)}
        </span>
      </div>
      <figcaption className="caption">
        Composite score by rank; stems are to a common scale. Click a stem to select that variant.
      </figcaption>
    </figure>
  );
}
