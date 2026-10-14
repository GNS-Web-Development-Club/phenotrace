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
  label: "matched the HPO label",
  synonym: "matched a synonym",
  layterm: "matched a lay term",
  added: "added by hand",
};

const MARK_CLASS: Record<string, string> = {
  label: "match",
  synonym: "match match-synonym",
  layterm: "match match-layterm",
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
        className={MARK_CLASS[c.source] ?? "match match-layterm"}
      >
        {text.slice(c.span_start, c.span_end)}
      </mark>,
    );
    cursor = c.span_end;
    lastEnd = c.span_end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <div className="measure">
      <p className="font-slab text-[1.15rem] leading-relaxed">{parts}</p>
      <p className="caption">
        Underlined phrases were matched: a single rule for an HPO label, a double rule for a
        synonym, a dotted rule for a lay term.
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
    <div className="sect">
      <h3 className="subhead">
        HPO terms
        {terms.length > 0 && <span className="head-note">{terms.length} selected</span>}
      </h3>

      <div className="mt-3 flex flex-col gap-5">
        {text && candidates.length > 0 && <HighlightedText text={text} cands={candidates} />}

        {terms.length === 0 ? (
          <p className="measure text-ink-2">
            No terms yet. Map a clinical description above, or search below to add terms by hand.
          </p>
        ) : (
          <table className="ruled max-w-[52rem]">
            <thead>
              <tr>
                <th className="w-[7.5rem]">Term</th>
                <th>Label</th>
                <th className="hidden sm:table-cell">Provenance</th>
                <th className="w-[4.5rem]">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => {
                const src = sourceById.get(t.id) ?? "added";
                return (
                  <tr key={t.id}>
                    <td className="font-mono text-ink-2">{t.id}</td>
                    <td className="font-medium">
                      {t.label}
                      <span className="block text-[0.9rem] font-normal text-ink-2 sm:hidden">
                        {SOURCE_LABEL[src] ?? src}
                      </span>
                    </td>
                    <td className="hidden text-ink-2 sm:table-cell">{SOURCE_LABEL[src] ?? src}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="btn-text text-[0.95rem]"
                        aria-label={`Remove ${t.label}`}
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div ref={boxRef} className="relative max-w-md">
          <label htmlFor="hpo-search" className="note">
            Add a term by searching the HPO vocabulary
          </label>
          <input
            id="hpo-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="input"
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
                      {added && <span className="ml-auto text-[0.9rem] text-ink-2">added</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {confirmed ? (
          <p className="measure">
            <span className="font-slab font-semibold">Indication confirmed.</span> The worksheet
            below is scored against these {terms.length} terms; editing them re-opens the query.
          </p>
        ) : (
          <div>
            <button type="button" onClick={onConfirm} disabled={terms.length === 0} className="btn">
              {`Confirm ${terms.length} term${terms.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
