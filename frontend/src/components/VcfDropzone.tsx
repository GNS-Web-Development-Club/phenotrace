import { useCallback, useRef, useState } from "react";
import type { VcfSummary } from "../lib/types";
import { api, IS_DEMO, REPO_URL } from "../lib/api";

interface Props {
  onLoaded: (s: VcfSummary) => void;
  onError: (msg: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}

export function VcfDropzone({ onLoaded, onError, busy, setBusy }: Props) {
  const [dragging, setDragging] = useState(false);
  const [path, setPath] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (fn: () => Promise<VcfSummary>) => {
      setBusy(true);
      onError("");
      try {
        onLoaded(await fn());
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onLoaded, onError, setBusy],
  );

  if (IS_DEMO) {
    return (
      <div className="sheet">
        <div className="sheet-head">
          <span className="sheet-title">Your own VCF</span>
          <span className="sheet-note">not available in the demo</span>
        </div>
        <div className="px-4 py-4">
          <p className="m-0 max-w-[70ch]">
            Uploads need the local app, which parses the file on your machine and never sends it
            anywhere. Clone the{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              repository
            </a>
            , run <code className="text-[0.95rem]">python run.py</code>, and drop a .vcf or .vcf.gz
            onto this panel.
          </p>
        </div>
      </div>
    );
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void run(() => api.uploadVcf(f));
  };

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">Your own VCF</span>
        <span className="sheet-note">.vcf or .vcf.gz, parsed on this machine, never uploaded</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a VCF file here, or press Enter to browse"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (busy) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={[
            "flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center",
            dragging ? "border-pen bg-pen-tint" : "border-rule bg-paper-2",
            busy ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          <p className="m-0 font-slab text-[1.2rem] font-semibold">
            {busy ? "Parsing" : dragging ? "Release to load" : "Drop a VCF here, or click to browse"}
          </p>
          <p className="m-0 mt-1 text-[0.95rem] text-ink-2">Streamed line by line; nothing leaves this machine.</p>
          <input
            ref={inputRef}
            type="file"
            accept=".vcf,.gz,.bgz"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => api.uploadVcf(f));
            }}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="vcf-path" className="field-label shrink-0">
            Or an absolute path on this machine (zero copy, best for large files)
          </label>
          <input
            id="vcf-path"
            type="text"
            value={path}
            disabled={busy}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && path.trim()) void run(() => api.loadVcf(path.trim()));
            }}
            className="input font-mono text-[0.95rem]"
          />
          <button
            type="button"
            disabled={busy || !path.trim()}
            onClick={() => void run(() => api.loadVcf(path.trim()))}
            className="btn shrink-0"
          >
            Load path
          </button>
        </div>
      </div>
    </div>
  );
}
