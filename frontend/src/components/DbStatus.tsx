import type { DbMeta } from "../lib/types";

const SOURCE_LABEL: Record<string, string> = {
  gnomad: "gnomAD",
  clinvar: "ClinVar",
  pathogenicity: "CADD",
  gene_map: "Gene map",
};

/**
 * Provenance of the annotation snapshots, set as a short ruled table at the
 * foot of the worksheet, the way a report lists its reference data.
 */
export function DbStatus({
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
      <p className="note" aria-live="polite">
        Checking annotation databases.
      </p>
    );
  }

  const present = status.filter((s) => s.present);
  const anySample = present.some((s) => (s.version ?? "").includes("SAMPLE"));

  if (present.length === 0) {
    return (
      <div className="measure flex flex-col items-start gap-3">
        <p>
          No annotation databases are installed, so variants cannot be scored. Install the bundled
          sample set to try the worksheet, or build real databases with{" "}
          <code className="text-[0.95rem]">tools/db-builder</code>.
        </p>
        <button type="button" onClick={onInstall} disabled={installing} className="btn">
          {installing ? "Installing" : "Install sample databases"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <table className="ruled max-w-[46rem]">
        <thead>
          <tr>
            <th>Source</th>
            <th>Snapshot</th>
            <th className="num">Rows</th>
          </tr>
        </thead>
        <tbody>
          {present.map((s) => (
            <tr key={s.source} title={s.version ?? ""}>
              <td>{SOURCE_LABEL[s.source] ?? s.source}</td>
              <td className="font-mono">{s.snapshot_date ?? "undated"}</td>
              <td className="num">{s.row_count?.toLocaleString() ?? "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="measure note mt-3">
        Frozen snapshots; the dates are the data's, not today's.
        {anySample && (
          <>
            {" "}
            These are small sample snapshots cut for the demo, not the real gnomAD, ClinVar or CADD
            releases. Build real databases with <code className="text-[0.9rem]">tools/db-builder</code>
            {" "}or{" "}
            <button type="button" onClick={onInstall} disabled={installing} className="btn-text">
              {installing ? "rebuilding the sample set" : "rebuild the sample set"}
            </button>
            .
          </>
        )}
      </p>
    </div>
  );
}
