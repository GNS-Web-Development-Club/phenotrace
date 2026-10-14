import { useState } from "react";
import type { ScoredVariant } from "../lib/types";
import { clnsigCategory, clnToneClass, fmtAF, zygosityLabel } from "../lib/annot";
import { ContributionBar } from "./viz/ContributionBar";

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

function Minor({ children }: { children: React.ReactNode }) {
  return <h4 className="m-0 font-slab text-[1.1rem] font-semibold">{children}</h4>;
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="kv">
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
        className="btn-text shrink-0 text-[0.9rem] text-ink-2"
      >
        {copied ? "copied" : "copy URL"}
      </button>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ExplanationPanel({ sv, rank }: { sv: ScoredVariant | null; rank: number }) {
  if (!sv) {
    return (
      <p className="sect measure text-ink-2">Select a ranked variant to see its score broken into factors.</p>
    );
  }

  const { variant: v, annotation: a, breakdown: b } = sv;
  const cln = clnsigCategory(a.clnsig);

  // The composite is read against the maximum achievable: the sum of weights.
  const maxComposite = b.factors.reduce((s, f) => s + f.weight, 0);

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
    <div className="sect">
      <h3 className="subhead">
        Worksheet entry, rank {rank + 1}
        <span className="head-note">{v.id}</span>
      </h3>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-slab text-[2.4rem] font-bold italic leading-none">
          {a.gene ?? "no gene annotation"}
        </span>
        <span className="font-mono text-[2.4rem] font-medium leading-none tracking-tight">
          {b.composite.toFixed(3)}
        </span>
        <span className="font-mono text-[1rem] text-ink-2">of {maxComposite.toFixed(2)}</span>
      </div>
      <p className="measure mt-2 text-ink-2">{sv.headline}</p>

      <div className="mt-4 max-w-[46rem]">
        <ContributionBar factors={b.factors} total={maxComposite} />
      </div>

      <section className="mt-6 max-w-[46rem]">
        <Minor>Factor by factor: raw times weight</Minor>
        <table className="ruled mt-2 table-fixed">
          <thead>
            <tr>
              <th>Factor</th>
              <th className="num w-14">Raw</th>
              <th className="num w-16">Weight</th>
              <th className="num w-16">Adds</th>
            </tr>
          </thead>
          <tbody>
            {b.factors.map((f) => {
              const off = !f.available || f.raw === null;
              return (
                <tr key={f.name}>
                  <td>
                    <span className="font-medium">{f.name}</span>
                    <span className="block text-[0.9rem] leading-snug text-ink-2">
                      {f.available ? f.reason : `no score available: ${f.reason}`}
                    </span>
                  </td>
                  <td className="num">{off ? "n/a" : f.raw!.toFixed(2)}</td>
                  <td className="num">{f.weight.toFixed(2)}</td>
                  <td className="num font-medium">{f.contribution.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-x-14 gap-y-6 md:grid-cols-2">
        <section>
          <Minor>Annotation, from the local database</Minor>
          <dl className="m-0 mt-1">
            <Detail label="Genotype" value={`${v.genotype ?? "n/a"}, ${zygosityLabel(v.zygosity)}`} />
            <Detail label="gnomAD AF" value={fmtAF(a.af)} />
            <Detail label="gnomAD popmax" value={fmtAF(a.popmax_af)} />
            <Detail
              label="ClinVar"
              value={
                <span className={clnToneClass[cln.tone]} title={a.clnsig ?? undefined}>
                  {cln.label}
                </span>
              }
            />
            <Detail label="Review status" value={(a.clnrevstat ?? "n/a").replace(/_/g, " ")} />
            <Detail
              label="Pathogenicity"
              value={a.pathogenicity_score != null ? `${a.pathogenicity_score} (${a.pathogenicity_source ?? ""})` : "n/a"}
            />
            <Detail label="Consequence" value={(a.consequence ?? "n/a").replace(/_/g, " ")} />
          </dl>
        </section>

        <section>
          <Minor>External references</Minor>
          <p className="note mt-1">Opened by you; nothing is fetched automatically.</p>
          <ul className="m-0 list-none p-0">
            <LinkRow label="gnomAD, this variant" url={gnomadVariantUrl(v)} />
            <LinkRow label="ClinVar, this locus" url={clinvarUrl(v)} />
            {a.gene && <LinkRow label={`gnomAD, ${a.gene}`} url={gnomadGeneUrl(a.gene)} />}
            {a.gene && <LinkRow label={`HPO, ${a.gene} phenotypes`} url={hpoGeneUrl(a.gene)} />}
          </ul>
        </section>
      </div>

      <section className="measure mt-6">
        <Minor>What would change this</Minor>
        <ul className="m-0 mt-1 list-disc pl-5 leading-relaxed">
          {hints.slice(0, 3).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
