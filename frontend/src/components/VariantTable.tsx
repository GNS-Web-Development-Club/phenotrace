import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Annotation, Variant, VcfSummary } from "../lib/types";
import { api } from "../lib/api";
import { clnsigCategory, clnToneClass, fmtAF, zygosityLabel } from "../lib/annot";

const PAGE = 200;
const ROW_H = 40;
const GRID =
  "grid grid-cols-[40px_170px_112px_88px_92px_150px_56px_112px_72px] items-center gap-2 pr-1";

function ClnSig({ clnsig }: { clnsig: string | null }) {
  const { label, tone } = clnsigCategory(clnsig);
  return (
    <span title={clnsig ?? "no ClinVar entry"} className={`truncate ${clnToneClass[tone]}`}>
      {label}
    </span>
  );
}

export function VariantTable({ summary }: { summary: VcfSummary }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Map<number, Variant>>(() => {
    const m = new Map<number, Variant>();
    for (const v of summary.first_variants) m.set(v.row - 1, v);
    return m;
  });
  const [annos, setAnnos] = useState<Map<string, Annotation>>(new Map());
  const loaded = useRef<Set<number>>(new Set());
  const pending = useRef<Set<number>>(new Set());

  const count = summary.total_variants;
  const virt = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 16,
  });

  const items = virt.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? 0;

  const fetchRange = useCallback((lo: number, hi: number) => {
    for (let p = Math.floor(lo / PAGE); p <= Math.floor(hi / PAGE); p++) {
      if (loaded.current.has(p) || pending.current.has(p)) continue;
      pending.current.add(p);
      api
        .getVariants(p * PAGE, PAGE)
        .then((vs) => {
          setRows((prev) => {
            const m = new Map(prev);
            for (const v of vs) m.set(v.row - 1, v);
            return m;
          });
          loaded.current.add(p);
          pending.current.delete(p);
          return api.annotate(vs.map((v) => v.id));
        })
        .then((anns) => {
          if (!anns) return;
          setAnnos((prev) => {
            const m = new Map(prev);
            for (const a of anns) m.set(a.variant_id, a);
            return m;
          });
        })
        .catch(() => pending.current.delete(p));
    }
  }, []);

  useEffect(() => {
    if (count > 0) fetchRange(first, last);
  }, [first, last, count, fetchRange]);

  const tableHeight = Math.min(Math.max(count, 3) * ROW_H + 2, 440);

  return (
    <div className="sect">
      <h3 className="subhead">
        Variant listing
        <span className="head-note">{count.toLocaleString()} rows</span>
      </h3>
      <p className="note mt-1">
        Every record in the file, in file order, with its local annotation.
        {count * ROW_H > 440 ? " The listing scrolls within itself." : ""}
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[960px]">
          <div className={`${GRID} rule-head py-1.5 text-[0.9rem] font-medium text-ink-2`}>
            <div className="text-right">No.</div>
            <div>Locus</div>
            <div>Change</div>
            <div>Gene</div>
            <div>gnomAD AF</div>
            <div>ClinVar</div>
            <div>CADD</div>
            <div>Zygosity</div>
            <div>Filter</div>
          </div>

          <div ref={parentRef} className="overflow-auto" style={{ height: tableHeight }}>
            <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
              {items.map((it) => {
                const v = rows.get(it.index);
                const a = v ? annos.get(v.id) : undefined;
                return (
                  <div
                    key={it.key}
                    className={`${GRID} ruled-row text-[0.95rem]`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: ROW_H,
                      transform: `translateY(${it.start}px)`,
                    }}
                  >
                    {v ? (
                      <>
                        <div className="text-right font-mono text-ink-2">{v.row}</div>
                        <div className="truncate font-mono">
                          <span className="text-ink-2">{v.chrom}:</span>
                          {v.pos.toLocaleString()}
                        </div>
                        <div className="truncate font-mono">
                          <span className="text-ink-2">{trunc(v.ref)}</span>
                          <span className="mx-1 text-ink-2">&gt;</span>
                          <span className="font-medium">{trunc(v.alt)}</span>
                        </div>
                        <div className="truncate">
                          {a?.gene ? <span className="italic">{a.gene}</span> : <span className="text-ink-2">none</span>}
                        </div>
                        <div className="truncate font-mono">
                          {a ? (
                            <span className={a.af === null ? "text-ink-2" : ""}>{fmtAF(a.af)}</span>
                          ) : (
                            <span className="text-ink-2">pending</span>
                          )}
                        </div>
                        <div className="truncate">
                          <ClnSig clnsig={a?.clnsig ?? null} />
                        </div>
                        <div className="font-mono">
                          {a?.pathogenicity_score != null ? a.pathogenicity_score.toFixed(1) : <span className="text-ink-2">n/a</span>}
                        </div>
                        <div className={v.zygosity ? "" : "text-ink-2"}>{zygosityLabel(v.zygosity)}</div>
                        <div className={v.filter === "PASS" || v.filter === "." ? "" : "italic"}>
                          {v.filter === "." ? "unfiltered" : v.filter}
                        </div>
                      </>
                    ) : (
                      <div className="col-span-9 font-mono text-ink-2">loading row {it.index + 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function trunc(s: string, n = 10): string {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}
