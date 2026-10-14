import type { DbMeta } from "../lib/types";

const SOURCE_LABEL: Record<string, string> = {
  gnomad: "gnomAD",
  clinvar: "ClinVar",
  pathogenicity: "CADD",
  gene_map: "Gene map",
};

export function DbBadge({
  status,
  onInstall,
  installing,
}: {
  status: DbMeta[] | null;
  onInstall: () => void;
  installing: boolean;
}) {
  if (!status) {
    return (
      <p className="sheet m-0 px-4 py-2.5 text-[0.95rem] text-ink-2" aria-live="polite">
        Checking annotation databases.
      </p>
    );
  }

  const present = status.filter((s) => s.present);
  const anySample = present.some((s) => (s.version ?? "").includes("SAMPLE"));

  if (present.length === 0) {
    return (
      <div className="sheet flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="m-0 text-[0.95rem]">
          <span className="font-slab font-semibold">No annotation databases installed.</span>{" "}
          Install the bundled sample set to enable scoring.
        </p>
        <button type="button" onClick={onInstall} disabled={installing} className="btn">
          {installing ? "Installing" : "Install sample databases"}
        </button>
      </div>
    );
  }

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">Annotation databases</span>
        {anySample && (
          <span className="stamp stamp-violet" role="status">
            Sample data
          </span>
        )}
        <span className="sheet-note">frozen snapshots; the dates are the data's, not today's</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
        {present.map((s) => (
          <div key={s.source} className="field" title={s.version ?? ""}>
            <span className="field-label">{SOURCE_LABEL[s.source] ?? s.source}</span>
            <span className="field-value">
              {s.snapshot_date ?? "undated"}
              <span className="block text-ink-2 sm:inline">
                <span className="hidden sm:inline"> · </span>
                {s.row_count?.toLocaleString() ?? "?"} rows
              </span>
            </span>
          </div>
        ))}
      </div>

      {anySample && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule-2 px-4 py-2 text-ink-2">
          <span>
            These are small demo snapshots, not real gnomAD, ClinVar or CADD. Build real databases
            with <code className="text-[0.9rem]">tools/db-builder</code>.
          </span>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className="btn btn-ruled btn-sm ml-auto"
          >
            {installing ? "Rebuilding" : "Rebuild sample DB"}
          </button>
        </div>
      )}
    </div>
  );
}
