// Mirrors backend/phenotrace/models.py — keep field names in sync.

export interface Variant {
  id: string;
  row: number;
  chrom: string;
  pos: number;
  ref: string;
  alt: string;
  qual: number | null;
  filter: string;
  genotype: string | null;
  zygosity: string | null;
}

export interface VcfSummary {
  file_path: string;
  total_variants: number;
  samples: string[];
  sample_name: string | null;
  fileformat: string | null;
  reference: string | null;
  parse_time_ms: number;
  multiallelic_records: number;
  skipped_lines: number;
  warnings: string[];
  first_variants: Variant[];
}

export interface SampleInfo {
  id: string;
  title: string;
  description: string;
  phenotype: string;
  variants: number;
}

export interface Annotation {
  variant_id: string;
  af: number | null;
  popmax_af: number | null;
  clnsig: string | null;
  clnrevstat: string | null;
  gene: string | null;
  consequence: string | null;
  consequence_rank: number | null;
  pathogenicity_score: number | null;
  pathogenicity_source: string | null;
}

export interface HpoTerm {
  id: string;
  label: string;
  definition: string | null;
  synonyms: string[];
}

export interface HpoCandidate {
  term: HpoTerm;
  confidence: number;
  matched_text: string;
  span_start: number;
  span_end: number;
  source: string;
}

export interface PhenotypeQuery {
  term_ids: string[];
  inheritance: string | null;
}

export interface Weights {
  gene_phenotype: number;
  pathogenicity: number;
  rarity: number;
  inheritance: number;
}

export interface PreFilter {
  max_af: number;
  drop_non_pass: boolean;
  enabled: boolean;
}

export interface FactorBreakdown {
  name: string;
  available: boolean;
  raw: number | null;
  weight: number;
  contribution: number;
  reason: string;
}

export interface ScoreBreakdown {
  composite: number;
  factors: FactorBreakdown[];
}

export interface ScoredVariant {
  variant: Variant;
  annotation: Annotation;
  breakdown: ScoreBreakdown;
  headline: string;
}

export interface ScoreStats {
  total: number;
  prefiltered_common: number;
  prefiltered_non_pass: number;
  scored: number;
  returned: number;
  annotations_available: boolean;
}

export interface ScoreResult {
  results: ScoredVariant[];
  stats: ScoreStats;
  weights: Weights;
  query: PhenotypeQuery;
  prefilter: PreFilter;
}

export interface ScoreRequest {
  query: PhenotypeQuery;
  weights: Weights;
  prefilter: PreFilter;
  top_n: number;
}

export interface DbMeta {
  source: string;
  present: boolean;
  version: string | null;
  snapshot_date: string | null;
  row_count: number | null;
  path: string | null;
}
