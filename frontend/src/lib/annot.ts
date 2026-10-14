// Shared annotation formatting/classification helpers (pure).
// Categorical values are written out as words; the only accent is the
// pathogenic class, set in the stamp red.

export type ClnTone = "path" | "benign" | "vus" | "conflict" | "none";

export function clnsigCategory(clnsig: string | null): { label: string; tone: ClnTone } {
  if (!clnsig) return { label: "none", tone: "none" };
  const s = clnsig.toLowerCase();
  if (s.includes("conflict")) return { label: "Conflicting", tone: "conflict" };
  // order matters: "likely_pathogenic" contains "pathogenic"
  if (s.includes("likely_pathogenic") || s.includes("likely pathogenic"))
    return { label: "Likely pathogenic", tone: "path" };
  if (s.includes("pathogenic")) return { label: "Pathogenic", tone: "path" };
  if (s.includes("likely_benign") || s.includes("likely benign"))
    return { label: "Likely benign", tone: "benign" };
  if (s.includes("benign")) return { label: "Benign", tone: "benign" };
  if (s.includes("uncertain")) return { label: "VUS", tone: "vus" };
  return { label: clnsig.replace(/_/g, " "), tone: "none" };
}

/** Text classes per ClinVar tone: ink for everything, red for the dangerous class. */
export const clnToneClass: Record<ClnTone, string> = {
  path: "text-stamp font-medium",
  benign: "",
  vus: "",
  conflict: "italic",
  none: "text-ink-2",
};

const ZYG: Record<string, string> = {
  het: "heterozygous",
  hom: "homozygous",
  hemi: "hemizygous",
};

export function zygosityLabel(z: string | null): string {
  if (!z) return "n/a";
  return ZYG[z] ?? z;
}

export function fmtAF(af: number | null): string {
  if (af === null || af === undefined) return "absent";
  if (af === 0) return "0";
  if (af < 0.001) return af.toExponential(1);
  return af.toFixed(af < 0.01 ? 4 : 3);
}
