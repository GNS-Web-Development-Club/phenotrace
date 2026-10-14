/**
 * Demo data layer. Built with VITE_DEMO=1, `api` resolves to this object and
 * every call is answered from JSON recorded against the real backend
 * (see README, "Demo"). Nothing here touches the network.
 *
 * What is live vs. recorded:
 *  - Weights, pre-filter, top_n and inheritance model: recomputed here. Each
 *    recorded factor carries its raw value, so composite = sum(raw x weight)
 *    exactly as the engine does; the inheritance factor was recorded for every
 *    selectable model.
 *  - Gene-phenotype association: recorded for each case's mapped HPO terms.
 *    Editing the term list does not change that factor in the demo.
 *  - HPO mapping / search: recorded for the three case descriptions and a
 *    handful of queries; anything else falls back to a substring match over the
 *    recorded vocabulary.
 *  - Export: CSV is generated from the live ranking; the HTML report is the
 *    backend's report for the case at default weights.
 */
import type { Api } from "../lib/api";
import type {
  Annotation,
  DbMeta,
  FactorBreakdown,
  HpoCandidate,
  HpoTerm,
  SampleInfo,
  ScoreRequest,
  ScoreResult,
  ScoredVariant,
  Variant,
  VcfSummary,
  Weights,
} from "../lib/types";

import casesJson from "./data/cases.json";
import dbStatusJson from "./data/db_status.json";
import defaultWeightsJson from "./data/default_weights.json";
import hpoInfoJson from "./data/hpo_info.json";
import hpoSearchJson from "./data/hpo_search.json";
import hpoVocabJson from "./data/hpo_vocab.json";
import samplesJson from "./data/samples.json";

interface RecordedCase {
  summary: VcfSummary;
  variants: Variant[];
  annotations: Annotation[];
  phenotype_text: string;
  candidates: HpoCandidate[];
  term_ids: string[];
  scores: Record<string, ScoreResult>;
  export_html: string;
  export_csv: string;
}

const CASES = casesJson as unknown as Record<string, RecordedCase>;
const SAMPLES = samplesJson as SampleInfo[];
const DB_STATUS = dbStatusJson as DbMeta[];
const DEFAULT_WEIGHTS = defaultWeightsJson as Weights;
const HPO_INFO = hpoInfoJson as { term_count: number; is_sample: boolean };
const HPO_SEARCH = hpoSearchJson as Record<string, HpoTerm[]>;
const HPO_VOCAB = hpoVocabJson as HpoTerm[];

export const UPLOAD_MESSAGE =
  "This is the bundled demo: it ships three recorded sample cases and cannot parse a VCF. " +
  "To triage your own file, run PhenoTrace locally with the Python backend.";

let current: RecordedCase | null = null;

const delay = <T,>(v: T, ms = 60): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(v), ms));

function requireCase(): RecordedCase {
  if (!current) throw new Error("No VCF loaded");
  return current;
}

function shortPath(summary: VcfSummary): VcfSummary {
  const name = summary.file_path.split(/[\\/]/).pop() ?? summary.file_path;
  return { ...summary, file_path: `fixtures/samples/${name}` };
}

/* ---- HPO -------------------------------------------------------------- */

function searchVocab(q: string, limit: number): HpoTerm[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const recorded = HPO_SEARCH[needle];
  if (recorded) return recorded.slice(0, limit);
  const hit = (t: HpoTerm) =>
    t.label.toLowerCase().includes(needle) ||
    t.id.toLowerCase() === needle ||
    t.synonyms.some((s) => s.toLowerCase().includes(needle));
  return HPO_VOCAB.filter(hit).slice(0, limit);
}

function mapText(text: string): HpoCandidate[] {
  const norm = text.trim().toLowerCase();
  for (const c of Object.values(CASES)) {
    if (c.phenotype_text.trim().toLowerCase() === norm) return c.candidates;
  }
  // Fallback: longest-match substring scan over labels and synonyms.
  const lower = text.toLowerCase();
  const found: HpoCandidate[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const entries: { term: HpoTerm; text: string; source: string }[] = [];
  for (const t of HPO_VOCAB) {
    entries.push({ term: t, text: t.label.toLowerCase(), source: "label" });
    for (const s of t.synonyms) entries.push({ term: t, text: s.toLowerCase(), source: "synonym" });
  }
  entries.sort((a, b) => b.text.length - a.text.length);
  for (const e of entries) {
    if (e.text.length < 4) continue;
    const i = lower.indexOf(e.text);
    if (i < 0 || overlaps(i, i + e.text.length)) continue;
    if (found.some((f) => f.term.id === e.term.id)) continue;
    taken.push([i, i + e.text.length]);
    found.push({
      term: e.term,
      confidence: e.source === "label" ? 0.95 : 0.85,
      matched_text: text.slice(i, i + e.text.length),
      span_start: i,
      span_end: i + e.text.length,
      source: e.source,
    });
  }
  return found.sort((a, b) => a.span_start - b.span_start);
}

/* ---- Scoring ---------------------------------------------------------- */

const WEIGHT_KEYS: (keyof Weights)[] = ["gene_phenotype", "pathogenicity", "rarity", "inheritance"];

function rescore(req: ScoreRequest): ScoreResult {
  const c = requireCase();
  if (req.query.term_ids.length === 0) {
    throw new Error("No phenotype terms: confirm a phenotype query first");
  }
  const key = req.query.inheritance || "none";
  const base = c.scores[key] ?? c.scores.none;
  const pf = req.prefilter;

  let common = 0;
  let nonPass = 0;
  const scored: ScoredVariant[] = [];
  for (const sv of base.results) {
    if (pf.enabled) {
      if (pf.drop_non_pass && sv.variant.filter !== "PASS" && sv.variant.filter !== ".") {
        nonPass += 1;
        continue;
      }
      const af = sv.annotation.popmax_af ?? sv.annotation.af;
      if (af !== null && af > pf.max_af) {
        common += 1;
        continue;
      }
    }
    const factors: FactorBreakdown[] = sv.breakdown.factors.map((f, i) => {
      const weight = req.weights[WEIGHT_KEYS[i]] ?? f.weight;
      const contribution =
        f.available && f.raw !== null ? Math.round(f.raw * weight * 10000) / 10000 : 0;
      return { ...f, weight, contribution };
    });
    const composite = Math.round(factors.reduce((s, f) => s + f.contribution, 0) * 10000) / 10000;
    scored.push({ ...sv, breakdown: { composite, factors } });
  }
  scored.sort((a, b) => b.breakdown.composite - a.breakdown.composite);
  const topN = Math.max(1, Math.min(req.top_n, 500));
  const results = scored.slice(0, topN);
  return {
    results,
    stats: {
      total: base.stats.total,
      prefiltered_common: common,
      prefiltered_non_pass: nonPass,
      scored: scored.length,
      returned: results.length,
      annotations_available: base.stats.annotations_available,
    },
    weights: req.weights,
    query: req.query,
    prefilter: req.prefilter,
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(result: ScoreResult): string {
  const names = result.results[0]?.breakdown.factors.map((f) => f.name) ?? [];
  const header = [
    "rank", "variant", "gene", "composite", "headline",
    "gnomad_af", "popmax_af", "clinvar", "clinrevstat", "cadd", "consequence",
    "zygosity", "genotype", "filter",
  ];
  for (const n of names) header.push(`${n} | raw`, `${n} | weight`, `${n} | contribution`, `${n} | reason`);
  const lines = [header.map(csvCell).join(",")];
  result.results.forEach((sv, i) => {
    const { annotation: a, variant: v, breakdown: b } = sv;
    const row: unknown[] = [
      i + 1, v.id, a.gene ?? "", b.composite.toFixed(4), sv.headline,
      a.af ?? "", a.popmax_af ?? "", a.clnsig ?? "", a.clnrevstat ?? "",
      a.pathogenicity_score ?? "", a.consequence ?? "", v.zygosity ?? "", v.genotype ?? "", v.filter,
    ];
    for (const f of b.factors) {
      row.push(f.raw === null ? "" : Math.round(f.raw * 10000) / 10000, f.weight, f.contribution, f.reason);
    }
    lines.push(row.map(csvCell).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

/* ---- The api surface -------------------------------------------------- */

export const demoApi: Api = {
  health: () => delay({ ok: true, vcf_loaded: current !== null }),

  loadVcf: () => Promise.reject(new Error(UPLOAD_MESSAGE)),
  uploadVcf: () => Promise.reject(new Error(UPLOAD_MESSAGE)),

  listSamples: () => delay(SAMPLES),

  loadSample: (id?: string) => {
    const c = id ? CASES[id] : CASES[SAMPLES[0].id];
    if (!c) return Promise.reject(new Error(`Unknown sample: ${id}`));
    current = c;
    return delay(shortPath(c.summary), 180);
  },

  getSummary: () => delay(shortPath(requireCase().summary)),

  getVariants: (offset, limit) => delay(requireCase().variants.slice(offset, offset + limit)),

  annotate: (ids) => {
    const c = requireCase();
    const want = new Set(ids);
    return delay(c.annotations.filter((a) => want.has(a.variant_id)));
  },

  dbStatus: () => delay(DB_STATUS),
  downloadDatabases: () => delay(DB_STATUS, 200),

  mapPhenotype: (text) => delay(mapText(text), 160),
  searchHpo: (q, limit = 12) => delay(searchVocab(q, limit), 40),
  hpoInfo: () => delay(HPO_INFO),

  scoreVariants: (req) => {
    try {
      return delay(rescore(req), 120);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  defaultWeights: () => delay(DEFAULT_WEIGHTS),

  exportReport: async (req, format) => {
    const c = requireCase();
    if (format === "csv") {
      return new Blob([toCsv(rescore(req))], { type: "text/csv" });
    }
    return new Blob([c.export_html], { type: "text/html" });
  },
};
