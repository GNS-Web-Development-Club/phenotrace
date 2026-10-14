import type { ScoredVariant } from "../../lib/types";

interface Props {
  results: ScoredVariant[];
  max: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// GRCh38 chromosome lengths (bp), used only to place markers proportionally.
const CHROM_LEN: Record<string, number> = {
  "1": 248956422, "2": 242193529, "3": 198295559, "4": 190214555, "5": 181538259,
  "6": 170805979, "7": 159345973, "8": 145138636, "9": 138394717, "10": 133797422,
  "11": 135086622, "12": 133275309, "13": 114364328, "14": 107043718, "15": 101991189,
  "16": 90338345, "17": 83257441, "18": 80373285, "19": 58617616, "20": 64444167,
  "21": 46709983, "22": 50818468, X: 156040895, Y: 57227415,
};
const MAX_LEN = CHROM_LEN["1"];

function norm(chrom: string): string {
  return chrom.replace(/^chr/i, "").toUpperCase();
}

/**
 * Figure: one hairline per chromosome that carries a ranked variant, drawn to
 * GRCh38 length, with a tick at each variant's position. Taller ticks score
 * higher. The selected variant is drawn in pen and labelled with its gene.
 */
export function ChromosomeMap({ results, max, selectedId, onSelect }: Props) {
  const denom = Math.max(0.0001, max);
  const byChrom = new Map<string, { sv: ScoredVariant; rank: number }[]>();
  results.forEach((sv, i) => {
    const c = norm(sv.variant.chrom);
    if (!(c in CHROM_LEN)) return;
    if (!byChrom.has(c)) byChrom.set(c, []);
    byChrom.get(c)!.push({ sv, rank: i });
  });

  const order = Object.keys(CHROM_LEN);
  const chroms = [...byChrom.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (chroms.length === 0) return null;

  return (
    <figure className="m-0">
      <div className="flex flex-col gap-0.5">
        {chroms.map((c) => {
          const len = CHROM_LEN[c];
          const trackPct = (len / MAX_LEN) * 100;
          const marks = byChrom.get(c)!;
          return (
            <div key={c} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-right font-mono text-[0.95rem] text-ink-2">{c}</span>
              <div className="relative h-7 flex-1">
                <div className="fig-track absolute top-1/2 -translate-y-1/2" style={{ width: `${trackPct}%` }} />
                <div className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-ink" style={{ left: `${trackPct}%` }} />
                {marks.map(({ sv, rank }) => {
                  const c2 = norm(sv.variant.chrom);
                  const posPct = Math.min(100, (sv.variant.pos / CHROM_LEN[c2]) * 100) * (trackPct / 100);
                  const selected = sv.variant.id === selectedId;
                  const strength = sv.breakdown.composite / denom;
                  const h = 9 + Math.round(strength * 11);
                  return (
                    <button
                      key={sv.variant.id}
                      type="button"
                      onClick={() => onSelect(sv.variant.id)}
                      title={`#${rank + 1} ${sv.annotation.gene ?? "no gene"}, ${sv.variant.id}, ${sv.breakdown.composite.toFixed(3)}`}
                      aria-label={`Rank ${rank + 1}, ${sv.annotation.gene ?? "unknown gene"} on chromosome ${c2}, score ${sv.breakdown.composite.toFixed(3)}`}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 py-1"
                      style={{ left: `${posPct}%` }}
                    >
                      <span
                        className={`block ${selected ? "w-[2px] bg-pen" : "w-px bg-ink"}`}
                        style={{ height: selected ? 22 : h }}
                      />
                      {selected && (
                        <span className="absolute bottom-1/2 left-full mb-[3px] whitespace-nowrap pl-1 font-mono text-[0.875rem] italic leading-none text-pen">
                          {sv.annotation.gene ?? sv.variant.id}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="caption">
        Ranked variants by chromosome position, chromosomes drawn to GRCh38 length. Taller ticks
        score higher; the selected variant is in pen. Click a tick to select it.
      </figcaption>
    </figure>
  );
}
