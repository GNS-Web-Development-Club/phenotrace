import { useCallback, useEffect, useRef, useState } from "react";
import type { DbMeta, HpoCandidate, HpoTerm, SampleInfo, VcfSummary } from "./lib/types";
import { api, IS_DEMO, REPO_URL } from "./lib/api";
import { VcfDropzone } from "./components/VcfDropzone";
import { SamplePicker } from "./components/SamplePicker";
import { VariantTable } from "./components/VariantTable";
import { DbBadge } from "./components/DbBadge";
import { PhenotypeInput } from "./components/PhenotypeInput";
import { TermEditor } from "./components/TermEditor";
import { ResultsSection } from "./components/ResultsSection";

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value" title={String(value)}>
        {value}
      </span>
    </div>
  );
}

function PartHeading({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="part-heading">
      <span className="part-no">Part {no}</span>
      <h2>{title}</h2>
      <span className="part-desc hidden sm:inline">{desc}</span>
    </div>
  );
}

function SpecimenSummary({ s, onReset }: { s: VcfSummary; onReset: () => void }) {
  const fname = s.file_path.split(/[\\/]/).pop() ?? s.file_path;
  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">Specimen received</span>
        <span className="stamp stamp-pass stamp-press">Received</span>
        <button type="button" onClick={onReset} className="btn btn-ruled btn-sm ml-auto">
          Change specimen
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="File" value={fname} />
        <Field label="Variants" value={s.total_variants.toLocaleString()} />
        <Field label="Sample" value={s.sample_name ?? "not stated"} />
        <Field label="Reference" value={s.reference ?? "not stated"} />
        <Field label="Multiallelic rows" value={s.multiallelic_records.toLocaleString()} />
        <Field label="Parse time" value={`${s.parse_time_ms} ms`} />
      </div>
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

  const dbSig =
    dbStatus
      ?.filter((s) => s.present)
      .map((s) => `${s.source}:${s.snapshot_date}`)
      .join("|") ?? "none";

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-6 sm:px-6">
      {/* Masthead */}
      <header className="border-b-2 border-ink pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-slab text-[2.4rem] font-bold leading-none tracking-tight sm:text-[2.9rem]">
              PhenoTrace
            </h1>
            <p className="mt-2 max-w-[62ch] text-[1.0625rem] leading-snug text-ink-2">
              Describe a patient's symptoms, and PhenoTrace maps them to HPO terms and ranks the
              variants in their VCF by likely causality, with every score broken into named factors.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.95rem]">
            <span>by Bryan Cheng</span>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
            {IS_DEMO ? (
              <span className="stamp stamp-violet">Demo</span>
            ) : (
              <span className="stamp stamp-pass">Local only</span>
            )}
          </div>
        </div>
        {IS_DEMO && (
          <p className="mt-3 max-w-[90ch] border-l-4 border-violet pl-3 text-ink-2">
            This is the bundled demo: three recorded sample cases, scored in the browser from data
            captured off the real backend. Your own VCF needs the local app; see the{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              repository
            </a>
            .
          </p>
        )}
      </header>

      {/* Disclaimer and database provenance */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-stamp px-4 py-2.5">
          <span className="stamp">Not a diagnostic device</span>
          <p className="m-0 leading-snug">
            Decision-support and research tool only. Rankings are hypotheses to investigate, not
            clinical conclusions.
          </p>
        </div>
        <DbBadge status={dbStatus} onInstall={installDbs} installing={installing} />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 border border-stamp bg-stamp-tint px-4 py-3 text-[0.95rem] text-stamp"
        >
          <span className="font-slab font-bold">Error</span>
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <PartHeading no="1" title="Specimen" desc="the patient VCF" />
          {summary ? (
            <>
              <SpecimenSummary s={summary} onReset={() => setSummary(null)} />
              <VariantTable
                key={`${summary.file_path}:${summary.total_variants}:${dbSig}`}
                summary={summary}
              />
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <SamplePicker
                samples={samples}
                onPick={onPickSample}
                loadingId={loadingSampleId}
                busy={busy}
              />
              <VcfDropzone onLoaded={setSummary} onError={setError} busy={busy} setBusy={setBusy} />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <PartHeading no="2" title="Clinical indication" desc="symptoms, mapped to HPO terms" />
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

        <section className="flex flex-col gap-4">
          <PartHeading no="3" title="Triage worksheet" desc="ranked variants and their reasons" />
          {!summary ? (
            <p className="sheet m-0 px-4 py-3 text-ink-2">
              Waiting on a specimen. Load a sample case in Part 1 to enable ranking.
            </p>
          ) : !confirmed ? (
            <p className="sheet m-0 px-4 py-3 text-ink-2">
              Waiting on a confirmed indication. Confirm the HPO terms in Part 2 to rank variants.
            </p>
          ) : (
            <ResultsSection termIds={terms.map((t) => t.id)} />
          )}
        </section>
      </div>

      <footer className="mt-14 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-rule pt-4 text-[0.95rem] text-ink-2">
        <span>
          <span className="font-slab font-semibold text-ink">PhenoTrace</span>, local-first
          phenotype-driven variant triage. Decision support, not diagnosis.
        </span>
        <span>
          {IS_DEMO ? "Static demo build; no server, no uploads." : "No patient data leaves this machine."}
        </span>
      </footer>
    </div>
  );
}
