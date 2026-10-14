// Shared annotation formatting/classification helpers (pure).

export type ClnTone = "path" | "benign" | "vus" | "conflict" | "none";

export function clnsigCategory(clnsig: string | null): { short: string; tone: ClnTone } {
  if (!clnsig) return { short: "none", tone: "none" };
  const s = clnsig.toLowerCase();
  if (s.includes("conflict")) return { short: "CONF", tone: "conflict" };
  // order matters: "likely_pathogenic" contains "pathogenic"
  if (s.includes("likely_pathogenic") || s.includes("likely pathogenic"))
    return { short: "LP", tone: "path" };
  if (s.includes("pathogenic")) return { short: "P", tone: "path" };
  if (s.includes("likely_benign") || s.includes("likely benign"))
    return { short: "LB", tone: "benign" };
  if (s.includes("benign")) return { short: "B", tone: "benign" };
  if (s.includes("uncertain")) return { short: "VUS", tone: "vus" };
  return { short: clnsig.slice(0, 4).toUpperCase(), tone: "none" };
}

/** Code-box colour class per ClinVar tone (see .code-* in index.css). */
export const clnToneClass: Record<ClnTone, string> = {
  path: "code code-red",
  benign: "code code-green",
  vus: "code code-ochre",
  conflict: "code code-violet",
  none: "code code-mute",
};

export function fmtAF(af: number | null): string {
  if (af === null || af === undefined) return "absent";
  if (af === 0) return "0";
  if (af < 0.001) return af.toExponential(1);
  return af.toFixed(af < 0.01 ? 4 : 3);
}
