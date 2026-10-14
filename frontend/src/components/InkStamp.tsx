import { useId } from "react";

/**
 * The one rubber stamp on the page. Drawn as SVG so the impression can be
 * uneven: the outline and lettering are displaced by low-frequency noise and
 * masked by high-frequency grain, the way a real stamp misses the paper in
 * places. Rotated a little, as a hand would leave it.
 */
export function InkStamp({ text, className = "" }: { text: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const grain = `grain-${id}`;
  return (
    <svg
      viewBox="0 0 320 60"
      className={`ink-stamp ${className}`}
      role="img"
      aria-label={text}
    >
      <defs>
        <filter id={grain} x="-6%" y="-12%" width="112%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.06" numOctaves="2" seed="5" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="bent" />
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="19" result="fine" />
          <feComponentTransfer in="fine" result="fineMask">
            <feFuncA type="table" tableValues="0 0.25 0.7 1 1 1" />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="1" seed="2" result="press" />
          <feComponentTransfer in="press" result="pressMask">
            <feFuncA type="table" tableValues="0.45 1 1" />
          </feComponentTransfer>
          <feComposite in="fineMask" in2="pressMask" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="mask" />
          <feComposite in="bent" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${grain})`} transform="rotate(-3 160 30)" opacity="0.92">
        <rect x="12" y="9" width="296" height="42" fill="none" stroke="#a3281c" strokeWidth="2.4" />
        <text
          x="160"
          y="37"
          textAnchor="middle"
          fill="#a3281c"
          fontFamily="'Zilla Slab', Rockwell, Georgia, serif"
          fontWeight={700}
          fontSize="19"
          letterSpacing="1.4"
        >
          {text.toUpperCase()}
        </text>
      </g>
    </svg>
  );
}
