import type { ScoredVariant } from "../../lib/types";

interface Props {
  results: ScoredVariant[];
  /** Max composite, for normalising bar heights. */
  max: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * One bar per ranked variant, in rank order. The selected variant is drawn in
 * pen blue; clicking a bar selects that variant.
 */
export function ScoreDistribution({ results, max, selectedId, onSelect }: Props) {
  if (results.length < 3) return null;
  const denom = Math.max(0.0001, max);

  return (
    <div
      className="mt-1 flex h-12 w-full items-end gap-px border-b border-ink"
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
            className="flex min-w-0 flex-1 items-end self-stretch"
          >
            <span className={`w-full ${selected ? "bg-pen" : "bg-ink opacity-60"}`} style={{ height: `${h}%` }} />
          </button>
        );
      })}
    </div>
  );
}
