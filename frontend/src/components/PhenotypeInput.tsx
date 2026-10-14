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
    <div>
      <label htmlFor="clinical-text" className="subhead block">
        Clinical features, in your own words
      </label>
      <p className="measure note mt-1">
        Write the presentation as you would on a referral. Mapping (or Ctrl+Enter) matches the
        phrases to HPO terms; you can correct the list below before it is confirmed.
      </p>
      <textarea
        id="clinical-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run(text);
        }}
        rows={3}
        className="input input-lined measure mt-3 resize-y"
      />
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <button type="button" onClick={() => void run(text)} disabled={busy || !text.trim()} className="btn">
          {busy ? "Mapping" : "Map to HPO terms"}
        </button>
        <span className="note min-w-0 flex-1 basis-[20rem]">
          or try{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 && "; "}
              <button
                type="button"
                onClick={() => {
                  setText(ex);
                  void run(ex);
                }}
                className="btn-text text-[0.95rem]"
              >
                {ex}
              </button>
            </span>
          ))}
        </span>
      </div>
      {err && <p className="mt-2 text-[0.95rem] text-stamp">{err}</p>}
    </div>
  );
}
