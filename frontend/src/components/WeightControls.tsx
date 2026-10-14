import type { PreFilter, Weights } from "../lib/types";
import { FACTOR_BG } from "./ExplanationPanel";

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
    <div className="sheet grid grid-cols-1 gap-6 px-4 py-4 md:grid-cols-2 md:gap-10">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="m-0 font-slab text-[1.1rem] font-semibold">Scoring weights</h3>
          <button type="button" onClick={() => onWeights({ ...DEFAULTS })} className="text-[0.95rem] text-pen underline underline-offset-[3px]">
            Reset to defaults
          </button>
        </div>

        {FACTORS.map((f, i) => {
          const val = weights[f.key];
          const def = DEFAULTS[f.key];
          const id = `w-${f.key}`;
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-3 text-[0.95rem]">
                <label htmlFor={id} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 ${FACTOR_BG[i]}`} aria-hidden="true" />
                  {f.label}
                </label>
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

        <p className="m-0">
          Weights sum to <span className="font-mono font-medium">{sum.toFixed(2)}</span>
          {balanced ? "." : "; composites are still comparable, the gauge scales to the sum."}
        </p>
      </section>

      <section className="flex min-w-0 flex-col gap-3 md:border-l md:border-rule md:pl-10">
        <h3 className="m-0 font-slab text-[1.1rem] font-semibold">Pre-filter and query</h3>

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

        <div className="field">
          <label htmlFor="inheritance-model" className="field-label">
            Inheritance model
          </label>
          <select id="inheritance-model" value={inheritance} onChange={(e) => onInheritance(e.target.value)} className="input">
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
