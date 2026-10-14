import { useCallback, useEffect, useRef, useState } from "react";
import type { DbMeta, HpoCandidate, HpoTerm, SampleInfo, VcfSummary } from "./lib/types";
import { api, IS_DEMO, REPO_URL } from "./lib/api";
import { VcfDropzone } from "./components/VcfDropzone";
import { SamplePicker } from "./components/SamplePicker";
import { VariantTable } from "./components/VariantTable";
import { DbStatus } from "./components/DbStatus";
import { PhenotypeInput } from "./components/PhenotypeInput";
import { TermEditor } from "./components/TermEditor";
import { ResultsSection } from "./components/ResultsSection";
import { InkStamp } from "./components/InkStamp";

function FormField({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="form-field">
      <dt>{label}</dt>
      <dd title={title ?? value}>{value}</dd>
    </div>
  );
}

function fmtDate(d: Date): string {
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function SpecimenSummary({ s, onReset }: { s: VcfSummary; onReset: () => void }) {
  const fname = s.file_path.split(/[\\/]/).pop() ?? s.file_path;
  return (
    <div className="measure">
      <p>
        <span className="font-mono">{fname}</span> was received and parsed in{" "}
        <span className="font-mono">{s.parse_time_ms} ms</span>:{" "}
        <span className="font-mono">{s.total_variants.toLocaleString()}</span> variant records for
        sample <span className="font-mono">{s.sample_name ?? "not stated"}</span>, called against{" "}
        <span className="font-mono">{s.reference ?? "an unstated reference"}</span>
        {s.multiallelic_records > 0 ? (
          <>
            , <span className="font-mono">{s.multiallelic_records.toLocaleString()}</span> of them
            multiallelic
          </>
        ) : (
          ", none multiallelic"
        )}
        {s.skipped_lines > 0 ? (
          <>
            ; <span className="font-mono">{s.skipped_lines.toLocaleString()}</span> lines were skipped.
          </>
        ) : (
          "."
        )}
      </p>
      {s.warnings.length > 0 && (
        <ul className="m-0 mt-2 list-disc pl-5 text-[0.95rem] text-ink-2">
          {s.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <p className="note mt-2">
        <button type="button" onClick={onReset} className="btn-text">
          Change specimen
        </button>
      </p>
    </div>
  );
}

export default function App() {
  const [summary, setSummary] = useState<VcfSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [dbStatus, setDbStatus] = useState<DbMeta[] | null>(null);
  const [installing, setInstalling] = useState(false);

  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);

  const [phenoText, setPhenoText] = useState("");
  const [phenoSeed, setPhenoSeed] = useState<{ text: string; nonce: number } | null>(null);
  const [candidates, setCandidates] = useState<HpoCandidate[]>([]);
  const [terms, setTerms] = useState<HpoTerm[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [scoredAt, setScoredAt] = useState<Date | null>(null);

  // Demo deep link: ?case=<id> opens with that sample loaded, mapped and scored.
  const autoConfirm = useRef(false);

  useEffect(() => {
    api.dbStatus().then(setDbStatus).catch(() => setDbStatus([]));
    api
      .listSamples()
      .then((list) => {
        setSamples(list);
        const want = IS_DEMO ? new URLSearchParams(window.location.search).get("case") : null;
        const hit = want ? list.find((s) => s.id === want) : undefined;
        if (hit) {
          autoConfirm.current = true;
          void onPickSample(hit);
        }
      })
      .catch(() => setSamples([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installDbs = useCallback(async () => {
    setInstalling(true);
    try {
      setDbStatus(await api.downloadDatabases());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  }, []);

  const onPickSample = useCallback(async (s: SampleInfo) => {
    setBusy(true);
    setLoadingSampleId(s.id);
    setError("");
    try {
      const sum = await api.loadSample(s.id);
      setSummary(sum);
      setScoredAt(null);
      setPhenoSeed({ text: s.phenotype, nonce: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoadingSampleId(null);
    }
  }, []);

  const onMapped = useCallback((text: string, cands: HpoCandidate[]) => {
    setPhenoText(text);
    setCandidates(cands);
    const uniq = new Map<string, HpoTerm>();
    for (const c of cands) uniq.set(c.term.id, c.term);
    setTerms([...uniq.values()]);
    setConfirmed(autoConfirm.current && uniq.size > 0);
    autoConfirm.current = false;
  }, []);

  const onTermsChange = useCallback((next: HpoTerm[]) => {
    setTerms(next);
    setConfirmed(false);
  }, []);

  const resetSpecimen = () => {
    setSummary(null);
    setScoredAt(null);
  };

  const dbSig =
    dbStatus
      ?.filter((s) => s.present)
      .map((s) => `${s.source}:${s.snapshot_date}`)
      .join("|") ?? "none";
  const dbMissing = dbStatus !== null && !dbStatus.some((s) => s.present);

  const fname = summary ? (summary.file_path.split(/[\\/]/).pop() ?? summary.file_path) : "";
  const indication = terms.length > 0 ? terms.map((t) => t.label).join("; ") : "";

  return (
    <div className="page">
      {/* Masthead: wordmark, then the ruled field block of a requisition. */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="wordmark">PhenoTrace</h1>
            <p className="wordmark-sub">Phenotype-driven variant triage worksheet</p>
          </div>
          <InkStamp text="Not a diagnostic device" className="mt-1" />
        </div>

        <dl className="form-fields">
          <FormField label="Specimen" value={fname} />
          <FormField label="Indication" value={indication} />
          <FormField label="Reference" value={summary?.reference ?? ""} />
          <FormField label="Date scored" value={scoredAt ? fmtDate(scoredAt) : ""} />
          <FormField label="Variants" value={summary ? summary.total_variants.toLocaleString() : ""} />
          <FormField label="Mode" value={IS_DEMO ? "demo, recorded cases" : "local, nothing leaves this machine"} />
        </dl>

        <p className="measure mt-7">
          Decision-support and research tool only. Rankings are hypotheses to investigate, not
          clinical conclusions.
          {IS_DEMO && (
            <>
              {" "}
              This build is the bundled demo: three recorded sample cases, scored in the browser from
              data captured off the real backend. Your own VCF needs the local app; see the{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                repository
              </a>
              .
            </>
          )}
          {dbMissing && " No annotation databases are installed yet; see Reference data at the foot of this page."}
        </p>
      </header>

      {error && (
        <p role="alert" className="measure mt-5 text-[0.95rem] text-stamp">
          <span className="font-slab font-bold">Error. </span>
          {error}
        </p>
      )}

      <section className="doc-section">
        <h2 className="running-head">
          Specimen
        </h2>
        {summary ? (
          <>
            <SpecimenSummary s={summary} onReset={resetSpecimen} />
            <VariantTable
              key={`${summary.file_path}:${summary.total_variants}:${dbSig}`}
              summary={summary}
            />
          </>
        ) : (
          <>
            <SamplePicker
              samples={samples}
              onPick={onPickSample}
              loadingId={loadingSampleId}
              busy={busy}
            />
            <VcfDropzone onLoaded={setSummary} onError={setError} busy={busy} setBusy={setBusy} />
          </>
        )}
      </section>

      <section className="doc-section">
        <h2 className="running-head">
          Clinical indication
        </h2>
        <PhenotypeInput onMapped={onMapped} seed={phenoSeed} />
        <TermEditor
          text={phenoText}
          candidates={candidates}
          terms={terms}
          confirmed={confirmed}
          onChange={onTermsChange}
          onConfirm={() => setConfirmed(true)}
        />
      </section>

      <section className="doc-section">
        <h2 className="running-head">
          Triage worksheet
        </h2>
        {!summary ? (
          <p className="measure italic text-ink-2">
            Waiting on a specimen. Load a sample case under Specimen to enable ranking.
          </p>
        ) : !confirmed ? (
          <p className="measure italic text-ink-2">
            Waiting on a confirmed indication. Confirm the HPO terms under Clinical indication to
            rank variants.
          </p>
        ) : (
          <ResultsSection termIds={terms.map((t) => t.id)} onScored={setScoredAt} />
        )}
      </section>

      <section className="doc-section">
        <h2 className="running-head">
          Reference data
        </h2>
        <DbStatus status={dbStatus} onInstall={installDbs} installing={installing} />
      </section>

      <footer className="mt-14 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-ink pt-3 text-[0.95rem] text-ink-2">
        <span>
          <span className="font-slab font-semibold text-ink">PhenoTrace</span>, by Bryan Cheng.
          Local-first phenotype-driven variant triage; decision support, not diagnosis.
        </span>
        <span>
          {IS_DEMO ? "Static demo build; no server, no uploads. " : "No patient data leaves this machine. "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
