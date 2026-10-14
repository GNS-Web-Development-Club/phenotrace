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
 * Schematic genome map: one ruled track per chromosome that carries a ranked
 * variant, with a tick placed proportionally by position. Taller, darker ticks
 * score higher; the selected variant is drawn in pen blue.
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
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">Genome map</span>
        <span className="sheet-note">
          schematic, GRCh38 lengths; {results.length} ranked variant{results.length === 1 ? "" : "s"}; click a tick to inspect
        </span>
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        {chroms.map((c) => {
          const len = CHROM_LEN[c];
          const trackPct = (len / MAX_LEN) * 100;
          const marks = byChrom.get(c)!;
          return (
            <div key={c} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-right font-mono text-[0.95rem] text-ink-2">{c}</span>
              <div className="relative h-5 flex-1">
                <div className="absolute top-1/2 h-px -translate-y-1/2 bg-ink" style={{ width: `${trackPct}%` }} />
                {marks.map(({ sv, rank }) => {
                  const c2 = norm(sv.variant.chrom);
                  const posPct = Math.min(100, (sv.variant.pos / CHROM_LEN[c2]) * 100) * (trackPct / 100);
                  const selected = sv.variant.id === selectedId;
                  const strength = sv.breakdown.composite / denom;
                  const h = 8 + Math.round(strength * 10);
                  return (
                    <button
                      key={sv.variant.id}
                      type="button"
                      onClick={() => onSelect(sv.variant.id)}
                      title={`#${rank + 1} ${sv.annotation.gene ?? "no gene"}, ${sv.variant.id}, ${sv.breakdown.composite.toFixed(3)}`}
                      aria-label={`Rank ${rank + 1}, ${sv.annotation.gene ?? "unknown gene"} on chromosome ${c2}, score ${sv.breakdown.composite.toFixed(3)}`}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1"
                      style={{ left: `${posPct}%` }}
                    >
                      <span
                        className={`block ${selected ? "w-[4px] bg-pen" : "w-[3px] bg-ink"}`}
                        style={{ height: selected ? 20 : h, opacity: selected ? 1 : 0.45 + 0.55 * strength }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
