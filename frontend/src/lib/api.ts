import type {
  Annotation,
  DbMeta,
  HpoCandidate,
  HpoTerm,
  SampleInfo,
  ScoreRequest,
  ScoreResult,
  Variant,
  VcfSummary,
  Weights,
} from "./types";
import { demoApi } from "../demo/api";

/** Built with VITE_DEMO=1: every call below is answered from bundled JSON. */
export const IS_DEMO = import.meta.env.VITE_DEMO === "1";
export const REPO_URL = "https://github.com/GNS-Web-Development-Club/phenotrace";

const BASE = "/api";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* keep statusText */
      }
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface Api {
  health: () => Promise<{ ok: boolean; vcf_loaded: boolean }>;
  loadVcf: (path: string) => Promise<VcfSummary>;
  listSamples: () => Promise<SampleInfo[]>;
  loadSample: (id?: string) => Promise<VcfSummary>;
  uploadVcf: (file: File) => Promise<VcfSummary>;
  getSummary: () => Promise<VcfSummary>;
  getVariants: (offset: number, limit: number) => Promise<Variant[]>;
  annotate: (ids: string[]) => Promise<Annotation[]>;
  dbStatus: () => Promise<DbMeta[]>;
  downloadDatabases: () => Promise<DbMeta[]>;
  mapPhenotype: (text: string) => Promise<HpoCandidate[]>;
  searchHpo: (q: string, limit?: number) => Promise<HpoTerm[]>;
  hpoInfo: () => Promise<{ term_count: number; is_sample: boolean }>;
  scoreVariants: (req: ScoreRequest) => Promise<ScoreResult>;
  defaultWeights: () => Promise<Weights>;
  exportReport: (req: ScoreRequest, format: "csv" | "html") => Promise<Blob>;
}

const liveApi: Api = {
  health: () => fetch(`${BASE}/health`).then(unwrap<{ ok: boolean; vcf_loaded: boolean }>),

  loadVcf: (path: string) =>
    fetch(`${BASE}/load_vcf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).then(unwrap<VcfSummary>),

  listSamples: () => fetch(`${BASE}/samples`).then(unwrap<SampleInfo[]>),

  loadSample: (id?: string) =>
    fetch(`${BASE}/load_sample${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      method: "POST",
    }).then(unwrap<VcfSummary>),

  uploadVcf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/load_vcf_upload`, { method: "POST", body: fd }).then(unwrap<VcfSummary>);
  },

  getSummary: () => fetch(`${BASE}/summary`).then(unwrap<VcfSummary>),

  getVariants: (offset: number, limit: number) =>
    fetch(`${BASE}/variants?offset=${offset}&limit=${limit}`).then(unwrap<Variant[]>),

  annotate: (ids: string[]) =>
    fetch(`${BASE}/annotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(unwrap<Annotation[]>),

  dbStatus: () => fetch(`${BASE}/db_status`).then(unwrap<DbMeta[]>),

  downloadDatabases: () =>
    fetch(`${BASE}/download_databases`, { method: "POST" }).then(unwrap<DbMeta[]>),

  mapPhenotype: (text: string) =>
    fetch(`${BASE}/map_phenotype`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(unwrap<HpoCandidate[]>),

  searchHpo: (q: string, limit = 12) =>
    fetch(`${BASE}/search_hpo?q=${encodeURIComponent(q)}&limit=${limit}`).then(unwrap<HpoTerm[]>),

  hpoInfo: () => fetch(`${BASE}/hpo_info`).then(unwrap<{ term_count: number; is_sample: boolean }>),

  scoreVariants: (req: ScoreRequest) =>
    fetch(`${BASE}/score_variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(unwrap<ScoreResult>),

  defaultWeights: () => fetch(`${BASE}/default_weights`).then(unwrap<Weights>),

  exportReport: async (req: ScoreRequest, format: "csv" | "html"): Promise<Blob> => {
    const r = await fetch(`${BASE}/export_report?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.blob();
  },
};

export const api: Api = IS_DEMO ? demoApi : liveApi;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
