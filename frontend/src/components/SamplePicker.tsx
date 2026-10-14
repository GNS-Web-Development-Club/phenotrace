import type { SampleInfo } from "../lib/types";

interface Props {
  samples: SampleInfo[];
  onPick: (s: SampleInfo) => void;
  loadingId: string | null;
  busy: boolean;
}

/**
 * Sample cases. Each loads a small synthetic VCF whose loci line up with the
 * bundled annotation database, so it produces a clear ranking at once.
 */
export function SamplePicker({ samples, onPick, loadingId, busy }: Props) {
  if (samples.length === 0) return null;

  return (
    <div>
      <h3 className="subhead">Sample cases</h3>
      <p className="measure note mt-1">
        Synthetic patients, not real data. Loading a case fills the indication below with the
        referral text recorded for it.
      </p>
      <ul className="m-0 mt-3 list-none p-0">
        {samples.map((s) => {
          const loading = loadingId === s.id;
          return (
            <li key={s.id} className="ruled-row py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(s)}
                className="btn-text font-slab text-[1.2rem] font-semibold"
              >
                {s.title}
              </button>
              <span className="ml-3 font-mono text-[0.95rem] text-ink-2">
                {s.variants} variants{loading ? ", loading" : ""}
              </span>
              <span className="measure mt-0.5 block leading-snug text-ink-2">{s.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
