import type { PreFilter, Weights } from "../lib/types";

const DEFAULTS: Weights = {
  gene_phenotype: 0.45,
  pathogenicity: 0.25,
  rarity: 0.2,
  inheritance: 0.1,
};

const FACTORS: { key: keyof Weights; label: string }[] = [
  { key: "gene_phenotype", label: "Gene-phenotype association" },
  { key: "pathogenicity", label: "Pathogenicity" },
  { key: "rarity", label: "Rarity" },
  { key: "inheritance", label: "Inheritance fit" },
];

const SLIDER_MAX = 0.8;

const INHERITANCE = [
  { v: "", label: "Any or unspecified" },
  { v: "AD", label: "Autosomal dominant" },
  { v: "AR", label: "Autosomal recessive" },
  { v: "XL", label: "X-linked" },
  { v: "de_novo", label: "de novo" },
];

interface Props {
  weights: Weights;
  prefilter: PreFilter;
  inheritance: string;
  onWeights: (w: Weights) => void;
  onPrefilter: (p: PreFilter) => void;
  onInheritance: (s: string) => void;
}

export function WeightControls({ weights, prefilter, inheritance, onWeights, onPrefilter, onInheritance }: Props) {
  const sum = FACTORS.reduce((acc, f) => acc + weights[f.key], 0);
  const balanced = Math.abs(sum - 1) <= 0.001;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-14">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="subhead">Scoring weights</h3>
          <button type="button" onClick={() => onWeights({ ...DEFAULTS })} className="btn-text text-[0.95rem]">
            Reset to defaults
          </button>
        </div>

        {FACTORS.map((f) => {
          const val = weights[f.key];
          const def = DEFAULTS[f.key];
          const id = `w-${f.key}`;
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-3 text-[0.95rem]">
                <label htmlFor={id}>{f.label}</label>
                <span className="font-mono">
                  {val.toFixed(2)}
                  <span className="text-ink-2"> (default {def.toFixed(2)})</span>
                </span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={SLIDER_MAX}
                step={0.05}
                value={val}
                onChange={(e) => onWeights({ ...weights, [f.key]: Number(e.target.value) })}
              />
            </div>
          );
        })}

        <p className="note">
          Weights sum to <span className="font-mono font-medium">{sum.toFixed(2)}</span>
          {balanced ? "." : "; composites stay comparable, and the score is read against that sum."}
        </p>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <h3 className="subhead">Pre-filter and query</h3>

        <label className="flex items-center gap-3 text-[0.95rem]">
          <input type="checkbox" checked={prefilter.enabled} onChange={(e) => onPrefilter({ ...prefilter, enabled: e.target.checked })} />
          Apply the pre-filter before scoring
        </label>

        <div className={prefilter.enabled ? "" : "pointer-events-none opacity-45"}>
          <div className="flex items-baseline justify-between gap-3 text-[0.95rem]">
            <label htmlFor="max-af">Drop variants with popmax AF above</label>
            <span className="font-mono">{prefilter.max_af.toFixed(3)}</span>
          </div>
          <input
            id="max-af"
            type="range"
            min={0}
            max={0.1}
            step={0.005}
            value={prefilter.max_af}
            disabled={!prefilter.enabled}
            onChange={(e) => onPrefilter({ ...prefilter, max_af: Number(e.target.value) })}
          />
          <label className="mt-2 flex items-center gap-3 text-[0.95rem]">
            <input
              type="checkbox"
              checked={prefilter.drop_non_pass}
              disabled={!prefilter.enabled}
              onChange={(e) => onPrefilter({ ...prefilter, drop_non_pass: e.target.checked })}
            />
            Drop variants that failed QC (non-PASS)
          </label>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.95rem]">
          <label htmlFor="inheritance-model">Inheritance model</label>
          <select id="inheritance-model" value={inheritance} onChange={(e) => onInheritance(e.target.value)} className="input text-[0.95rem]">
            {INHERITANCE.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
