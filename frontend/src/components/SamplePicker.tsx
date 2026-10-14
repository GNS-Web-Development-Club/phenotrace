import type { SampleInfo } from "../lib/types";

interface Props {
  samples: SampleInfo[];
  onPick: (s: SampleInfo) => void;
  loadingId: string | null;
  busy: boolean;
}

/**
 * One-click sample cases. Each loads a small synthetic VCF whose loci line up
 * with the bundled annotation database, so it produces a clear ranking at once.
 */
export function SamplePicker({ samples, onPick, loadingId, busy }: Props) {
  if (samples.length === 0) return null;

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">Sample cases</span>
        <span className="sheet-note">synthetic patients, not real data</span>
      </div>
      <ul className="m-0 list-none p-0">
        {samples.map((s, i) => {
          const loading = loadingId === s.id;
          return (
            <li key={s.id} className={i < samples.length - 1 ? "ruled-row" : ""}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(s)}
                className="row-btn flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
              >
                <span className="font-mono text-[0.95rem] text-ink-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-slab text-[1.15rem] font-semibold">{s.title}</span>
                <span className="font-mono text-[0.95rem] text-ink-2">{s.variants} variants</span>
                <span className="ml-auto text-[0.95rem] text-pen underline underline-offset-[3px]">
                  {loading ? "Loading" : "Load case"}
                </span>
                <span className="basis-full leading-snug text-ink-2">
                  {s.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
