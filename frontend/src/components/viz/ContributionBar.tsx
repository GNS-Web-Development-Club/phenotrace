import type { FactorBreakdown } from "../../lib/types";

/* Four fills in one ink: solid, two hatches, a stipple. No colour. */
const FILL: React.CSSProperties[] = [
  { backgroundColor: "var(--color-ink)" },
  { backgroundImage: "repeating-linear-gradient(45deg, var(--color-ink) 0 1.5px, transparent 1.5px 4.5px)" },
  { backgroundImage: "repeating-linear-gradient(-45deg, var(--color-ink) 0 1px, transparent 1px 4px)" },
  { backgroundImage: "repeating-linear-gradient(90deg, var(--color-ink) 0 1px, transparent 1px 3px)" },
];

interface Seg {
  f: FactorBreakdown;
  i: number;
  pct: number;
  start: number;
}

/**
 * Figure: the composite as a thin horizontal bar, one segment per factor.
 * Segments are labelled in place with a short leader: even factors above the
 * bar, odd factors below, so no leader crosses a label. On a phone the labels
 * are set as a list instead so they cannot collide.
 */
export function ContributionBar({ factors, total }: { factors: FactorBreakdown[]; total: number }) {
  const denom = Math.max(0.0001, total);
  let cursor = 0;
  const segs: Seg[] = factors.map((f, i) => {
    const pct = (Math.max(0, f.contribution) / denom) * 100;
    const start = cursor;
    cursor += pct;
    return { f, i, pct, start };
  });

  const label = (s: Seg) => `${s.f.name} ${s.f.contribution.toFixed(3)}`;

  const Labels = ({ side }: { side: "above" | "below" }) => (
    <div className="relative hidden h-[1.9rem] sm:block" aria-hidden="true">
      {segs
        .filter((s) => (side === "above" ? s.i % 2 === 0 : s.i % 2 === 1))
        .map((s) => {
          const fromRight = s.start > 70;
          return (
            <span key={s.f.name}>
              <span
                className="absolute w-px bg-ink"
                style={{ left: `${s.start}%`, height: "0.6rem", ...(side === "above" ? { bottom: 0 } : { top: 0 }) }}
              />
              <span
                className="absolute whitespace-nowrap font-mono text-[0.875rem] leading-none"
                style={{
                  ...(side === "above" ? { bottom: "0.75rem" } : { top: "0.75rem" }),
                  ...(fromRight ? { right: `${100 - s.start}%`, paddingRight: "5px" } : { left: `${s.start}%`, paddingLeft: "5px" }),
                }}
              >
                {label(s)}
              </span>
            </span>
          );
        })}
    </div>
  );

  return (
    <figure
      className="m-0"
      role="img"
      aria-label={`Composite by factor: ${factors
        .map((f) => `${f.name} ${f.contribution.toFixed(3)}`)
        .join(", ")}.`}
    >
      <Labels side="above" />
      <div className="flex h-[11px] w-full border border-ink">
        {segs.map((s) => (
          <span
            key={s.f.name}
            className="block h-full border-r border-paper last:border-r-0"
            style={{ width: `${s.pct}%`, ...FILL[s.i % 4] }}
            title={label(s)}
          />
        ))}
      </div>
      <Labels side="below" />
      <ul className="m-0 mt-2 list-none p-0 font-mono text-[0.875rem] sm:hidden" aria-hidden="true">
        {segs.map((s) => (
          <li key={s.f.name}>{label(s)}</li>
        ))}
      </ul>
    </figure>
  );
}
