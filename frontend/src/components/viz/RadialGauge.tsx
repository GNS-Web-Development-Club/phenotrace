import { useEffect, useState } from "react";

interface RadialGaugeProps {
  /** Fraction filled, 0..1. */
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A pure-SVG circular gauge. The arc starts at 12 o'clock and grows clockwise;
 * it tweens whenever `value` changes (reduced motion is honoured by the global
 * CSS rule that zeroes transition durations).
 */
export function RadialGauge({ value, size = 84, stroke = 8, className = "", children }: RadialGaugeProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(v));
    return () => cancelAnimationFrame(id);
  }, [v]);

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - shown);
  const c = size / 2;

  return (
    <div className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-paper-3" />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="gauge-arc stroke-ink"
        />
      </svg>
      {children != null && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
