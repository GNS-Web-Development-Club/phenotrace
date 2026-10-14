import { useEffect, useMemo, useRef, useState } from "react";
import type { HpoCandidate, HpoTerm } from "../lib/types";
import { api } from "../lib/api";

interface Props {
  text: string;
  candidates: HpoCandidate[];
  terms: HpoTerm[];
  confirmed: boolean;
  onChange: (terms: HpoTerm[]) => void;
  onConfirm: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  label: "matched label",
  synonym: "matched synonym",
  layterm: "matched lay term",
  added: "added by hand",
};

const MARK_CLASS: Record<string, string> = {
  label: "decoration-pen",
  synonym: "decoration-violet",
  layterm: "decoration-ochre",
};

function HighlightedText({ text, cands }: { text: string; cands: HpoCandidate[] }) {
  const spans = [...cands]
    .filter((c) => c.span_end > c.span_start)
    .sort((a, b) => a.span_start - b.span_start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let lastEnd = -1;
  spans.forEach((c, i) => {
    if (c.span_start < lastEnd) return;
    if (c.span_start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, c.span_start)}</span>);
    parts.push(
      <mark
        key={`m${i}`}
        title={`${c.term.label} (${c.term.id}), ${SOURCE_LABEL[c.source] ?? c.source}`}
        className={`bg-transparent text-ink underline decoration-[3px] underline-offset-[4px] ${
          MARK_CLASS[c.source] ?? "decoration-ochre"
        }`}
      >
        {text.slice(c.span_start, c.span_end)}
      </mark>,
    );
    cursor = c.span_end;
    lastEnd = c.span_end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <div className="border-l-4 border-rule pl-3">
      <p className="m-0 leading-relaxed">{parts}</p>
      <p className="m-0 mt-1 text-[0.875rem] text-ink-2">
        Underlined phrases were matched. Blue: HPO label; violet: synonym; ochre: lay term.
      </p>
    </div>
  );
}

export function TermEditor({ text, candidates, terms, confirmed, onChange, onConfirm }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<HpoTerm[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const sourceById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) m.set(c.term.id, c.source);
    return m;
  }, [candidates]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api.searchHpo(q).then(setResults).catch(() => setResults([]));
    }, 180);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const has = (id: string) => terms.some((t) => t.id === id);
  const add = (t: HpoTerm) => {
    if (!has(t.id)) onChange([...terms, t]);
    setQ("");
    setResults([]);
    setOpen(false);
  };
  const remove = (id: string) => onChange(terms.filter((t) => t.id !== id));

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">HPO terms</span>
        {terms.length > 0 && (
          <span className="sheet-note font-mono">{terms.length} selected</span>
        )}
        {confirmed && <span className="stamp stamp-pass stamp-press ml-auto">Confirmed</span>}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {text && candidates.length > 0 && <HighlightedText text={text} cands={candidates} />}

        {terms.length === 0 ? (
          <p className="m-0 text-ink-2">
            No terms yet. Map a clinical description above, or search below to add terms by hand.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {terms.map((t, i) => {
              const src = sourceById.get(t.id) ?? "added";
              return (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 ${
                    i < terms.length - 1 ? "ruled-row" : ""
                  }`}
                >
                  <span className="font-mono text-[0.95rem] text-ink-2">{t.id}</span>
                  <span className="font-medium">{t.label}</span>
                  <span className="text-[0.875rem] text-ink-2">{SOURCE_LABEL[src] ?? src}</span>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="ml-auto text-[0.875rem] text-pen underline underline-offset-[3px]"
                    aria-label={`Remove ${t.label}`}
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={boxRef} className="relative max-w-md">
          <label htmlFor="hpo-search" className="field-label">
            Add a term (search the HPO vocabulary)
          </label>
          <input
            id="hpo-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="input mt-1"
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-20 m-0 mt-1 max-h-64 w-full list-none overflow-auto border border-ink bg-paper p-0"
            >
              {results.map((t) => {
                const added = has(t.id);
                return (
                  <li key={t.id} className="ruled-row">
                    <button
                      type="button"
                      onClick={() => add(t)}
                      disabled={added}
                      role="option"
                      aria-selected={added}
                      className="row-btn flex items-baseline gap-3 px-3 py-2"
                    >
                      <span className="font-mono text-[0.9rem] text-ink-2">{t.id}</span>
                      <span className="truncate">{t.label}</span>
                      {added && <span className="ml-auto text-[0.875rem] text-ink-2">added</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={terms.length === 0 || confirmed}
            className="btn"
          >
            {confirmed
              ? "Indication confirmed"
              : `Confirm ${terms.length} term${terms.length === 1 ? "" : "s"}`}
          </button>
          {confirmed && (
            <span className="text-[0.95rem] text-ink-2">Edit the terms to re-open the query.</span>
          )}
        </div>
      </div>
    </div>
  );
}
