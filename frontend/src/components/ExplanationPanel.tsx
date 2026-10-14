import { useState } from "react";
import type { ScoredVariant } from "../lib/types";
import { clnsigCategory, clnToneClass, fmtAF } from "../lib/annot";
import { RadialGauge } from "./viz/RadialGauge";

/* Factor colours, in engine order: gene, pathogenicity, rarity, inheritance. */
export const FACTOR_BG = ["bg-pen", "bg-stamp", "bg-ochre", "bg-violet"];

function stripChr(c: string): string {
  return c.replace(/^chr/i, "");
}
function gnomadVariantUrl(v: ScoredVariant["variant"]): string {
  return `https://gnomad.broadinstitute.org/variant/${stripChr(v.chrom)}-${v.pos}-${v.ref}-${v.alt}?dataset=gnomad_r4`;
}
function clinvarUrl(v: ScoredVariant["variant"]): string {
  return `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(`${stripChr(v.chrom)}:${v.pos}`)}`;
}
function gnomadGeneUrl(gene: string): string {
  return `https://gnomad.broadinstitute.org/gene/${gene}?dataset=gnomad_r4`;
}
function hpoGeneUrl(gene: string): string {
  return `https://hpo.jax.org/app/browse/search?q=${encodeURIComponent(gene)}`;
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 font-slab text-[1.1rem] font-semibold">{children}</h3>;
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="ruled-row flex items-baseline justify-between gap-3 py-1.5 text-[0.95rem]">
      <a href={url} target="_blank" rel="noreferrer" className="truncate">
        {label}
      </a>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label={copied ? "URL copied" : `Copy URL for ${label}`}
        className="shrink-0 text-[0.875rem] text-ink-2 underline underline-offset-[3px]"
      >
        {copied ? "copied" : "copy URL"}
      </button>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ruled-row flex items-baseline justify-between gap-3 py-1.5 text-[0.95rem]">
      <span className="shrink-0 text-ink-2">{label}</span>
      <span className="truncate text-right font-mono">{value}</span>
    </div>
  );
}

export function ExplanationPanel({ sv }: { sv: ScoredVariant | null }) {
  if (!sv) {
    return (
      <div className="sheet grid h-full min-h-[12rem] place-items-center p-8 text-center">
        <p className="m-0 max-w-[36ch] text-ink-2">
          Select a ranked variant to see its score broken into factors.
        </p>
      </div>
    );
  }

  const { variant: v, annotation: a, breakdown: b } = sv;
  const cln = clnsigCategory(a.clnsig);

  // Gauge: composite as a fraction of the maximum achievable (sum of weights).
  const maxComposite = b.factors.reduce((s, f) => s + f.weight, 0);
  const gaugeValue = maxComposite > 0 ? b.composite / maxComposite : 0;

  const hints: string[] = [];
  const gene = b.factors[0];
  if (gene.available && (gene.raw ?? 0) < 0.34) {
    hints.push(
      gene.raw === 0
        ? `${a.gene ?? "This gene"} is not linked to the queried phenotype. Adding a matching term, or raising the gene-phenotype weight, moves true matches above it.`
        : "Weak gene-phenotype link; refining the phenotype terms changes which genes match.",
    );
  }
  for (const f of b.factors) {
    if (!f.available) hints.push(`${f.name} is unavailable for this variant (${f.reason}).`);
  }
  hints.push("Move the weight sliders above and the ranking updates in place.");

  return (
    <div className="sheet flex h-full flex-col">
      <div className="sheet-head">
        <span className="sheet-title">Worksheet entry</span>
        <span className="sheet-note font-mono">{v.id}</span>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="font-slab text-[1.7rem] font-bold italic leading-none">
              {a.gene ?? "no gene annotation"}
            </div>
            <div className="mt-2 text-[0.95rem] text-ink-2">{sv.headline}</div>
          </div>
          <RadialGauge value={gaugeValue} size={96} stroke={9} className="shrink-0">
            <div>
              <div className="font-mono text-[1.25rem] font-semibold leading-none">{b.composite.toFixed(3)}</div>
              <div className="mt-1 text-[0.8rem] text-ink-2">of {maxComposite.toFixed(2)}</div>
            </div>
          </RadialGauge>
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Subhead>Composite is the sum of four contributions</Subhead>
            <span className="font-mono text-[0.95rem]">= {b.composite.toFixed(3)}</span>
          </div>
          <div
            role="img"
            aria-label={`Composite ${b.composite.toFixed(3)} by factor: ${b.factors
              .map((f) => `${f.name} ${f.contribution.toFixed(3)}`)
              .join(", ")}.`}
            className="flex h-6 w-full border border-ink bg-paper-3"
          >
            {b.factors.map((f, i) => {
              const pct = Math.max(0, f.contribution) * 100;
              return (
                <span
                  key={f.name}
                  className={`${FACTOR_BG[i % 4]} flex h-full items-center justify-center overflow-hidden border-r border-paper font-mono text-[0.8rem] text-paper last:border-r-0`}
                  style={{ width: `${pct}%` }}
                  title={`${f.name}: ${f.contribution.toFixed(3)}`}
                >
                  {pct >= 9 ? `${Math.round(pct)}%` : null}
                </span>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Subhead>Factor by factor: raw times weight</Subhead>
          <table className="w-full table-fixed border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-1 pr-2 font-medium">Factor</th>
                <th className="w-14 py-1 pr-2 text-right font-medium">Raw</th>
                <th className="w-16 py-1 pr-2 text-right font-medium">Weight</th>
                <th className="w-16 py-1 text-right font-medium">Adds</th>
              </tr>
            </thead>
            <tbody>
              {b.factors.map((f, i) => {
                const off = !f.available || f.raw === null;
                return (
                  <tr key={f.name} className="ruled-row align-top">
                    <td className="py-2 pr-2">
                      <span className="flex items-start gap-2">
                        <span className={`mt-[0.45rem] h-2.5 w-2.5 shrink-0 ${FACTOR_BG[i % 4]}`} aria-hidden="true" />
                        <span>
                          <span className="font-medium">{f.name}</span>
                          <span className="block text-[0.875rem] leading-snug text-ink-2">
                            {f.available ? f.reason : `no score available: ${f.reason}`}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">{off ? "n/a" : f.raw!.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right font-mono">{f.weight.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono font-medium">{f.contribution.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <section>
            <Subhead>Annotation (local database)</Subhead>
            <div className="mt-1">
              <Detail label="Genotype" value={`${v.genotype ?? "n/a"} (${v.zygosity ?? "unknown"})`} />
              <Detail label="gnomAD AF" value={fmtAF(a.af)} />
              <Detail label="gnomAD popmax" value={fmtAF(a.popmax_af)} />
              <Detail
                label="ClinVar"
                value={<span className={clnToneClass[cln.tone]}>{a.clnsig ?? "none"}</span>}
              />
              <Detail label="Review status" value={a.clnrevstat ?? "n/a"} />
              <Detail
                label="Pathogenicity"
                value={a.pathogenicity_score != null ? `${a.pathogenicity_score} (${a.pathogenicity_source ?? ""})` : "n/a"}
              />
              <Detail label="Consequence" value={a.consequence ?? "n/a"} />
            </div>
          </section>

          <section>
            <Subhead>External references</Subhead>
            <p className="m-0 mt-1 text-[0.875rem] text-ink-2">Opened by you; nothing is fetched automatically.</p>
            <ul className="m-0 list-none p-0">
              <LinkRow label="gnomAD, this variant" url={gnomadVariantUrl(v)} />
              <LinkRow label="ClinVar, this locus" url={clinvarUrl(v)} />
              {a.gene && <LinkRow label={`gnomAD, ${a.gene}`} url={gnomadGeneUrl(a.gene)} />}
              {a.gene && <LinkRow label={`HPO, ${a.gene} phenotypes`} url={hpoGeneUrl(a.gene)} />}
            </ul>
          </section>
        </div>

        <section className="border-l-4 border-pen pl-3">
          <Subhead>What would change this</Subhead>
          <ul className="m-0 mt-1 list-disc pl-5 text-[0.95rem] leading-relaxed">
            {hints.slice(0, 3).map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
