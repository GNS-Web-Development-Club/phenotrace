import { useEffect, useRef, useState } from "react";
import type { HpoCandidate } from "../lib/types";
import { api } from "../lib/api";

const EXAMPLES = [
  "seizures, developmental delay, low muscle tone",
  "recurrent chest infections, salty sweat, failure to thrive",
  "high cholesterol and early coronary artery disease",
];

export function PhenotypeInput({
  onMapped,
  seed,
}: {
  onMapped: (text: string, cands: HpoCandidate[]) => void;
  seed?: { text: string; nonce: number } | null;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lastSeed = useRef<number>(0);

  const run = async (t: string) => {
    if (!t.trim()) return;
    setBusy(true);
    setErr("");
    try {
      onMapped(t, await api.mapPhenotype(t));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // When a sample case is loaded, pre-fill its suggested description and map it.
  useEffect(() => {
    if (seed && seed.nonce !== lastSeed.current) {
      lastSeed.current = seed.nonce;
      setText(seed.text);
      void run(seed.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <label htmlFor="clinical-text" className="sheet-title">
          Clinical features, in your own words
        </label>
        <span className="sheet-note">Ctrl+Enter maps the text</span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        <textarea
          id="clinical-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run(text);
          }}
          rows={3}
          className="input resize-y leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => void run(text)} disabled={busy || !text.trim()} className="btn">
            {busy ? "Mapping" : "Map to HPO terms"}
          </button>
          <span className="text-[0.95rem] text-ink-2">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                void run(ex);
              }}
              className="text-left text-[0.95rem] text-pen underline underline-offset-[3px]"
            >
              {ex}
            </button>
          ))}
        </div>
        {err && <p className="m-0 text-[0.95rem] text-stamp">{err}</p>}
      </div>
    </div>
  );
}
