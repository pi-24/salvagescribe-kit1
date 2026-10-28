"use client";

// components/ProvenanceTab.jsx — photo evidence, raw sources, ledger table
// with explicit per-attribute source attribution.

import {
  Camera,
  FileSpreadsheet,
  NotebookPen,
  Languages,
  UserCheck,
  ShieldOff,
} from "lucide-react";
import { StatusChip, SourceBadge, SectionTitle } from "./ui.jsx";

export default function ProvenanceTab({ ledger, onConfirm }) {
  if (!ledger) return <LoadingGrid />;

  const rows = Object.entries(ledger.ledger ?? {});

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
      {/* Left column: evidence */}
      <div className="space-y-6">
        {ledger.exclusion_flag && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <div>
              <p className="text-xs font-semibold tracking-wider text-rose-300">
                HAZARDOUS-CLASS EXCLUSION FLAG
              </p>
              <p className="mt-1 text-sm leading-relaxed text-rose-100/80">
                This part matched a non-hazardous-only exclusion term. Listing
                drafts are blocked pending specialist review.
              </p>
            </div>
          </div>
        )}

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint={`${ledger.photos?.length ?? 0} attached`}>
            Photo Evidence
          </SectionTitle>
          <div className="space-y-2.5">
            {(ledger.photos ?? []).map((p) => (
              <div
                key={p.file}
                className="glass-deep glass-hover flex items-center gap-3 rounded-xl p-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20">
                  <Camera className="h-4.5 w-4.5 text-violet-300" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-white/80">
                    {p.file}
                  </p>
                  <p className="truncate text-[11px] text-white/45">{p.shows}</p>
                </div>
              </div>
            ))}
            {(!ledger.photos || ledger.photos.length === 0) && (
              <p className="text-xs text-white/35">No photos attached.</p>
            )}
          </div>
        </section>

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint="inventory.csv">
            <span className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-sky-300" />
              Spreadsheet Row
            </span>
          </SectionTitle>
          <dl className="space-y-1.5 text-[13px]">
            {Object.entries(ledger.spreadsheet_row ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="shrink-0 text-white/40">{k.replace(/_/g, " ")}</dt>
                <dd className="text-right font-medium text-white/85">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint="dismantling notes">
            <span className="flex items-center gap-1.5">
              <NotebookPen className="h-3.5 w-3.5 text-emerald-300" />
              Dismantling Notes
            </span>
          </SectionTitle>
          <div className="space-y-3 text-[13px] leading-relaxed">
            {ledger.notes?.en && (
              <p className="text-white/80">
                <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white/50">
                  EN
                </span>
                {ledger.notes.en}
              </p>
            )}
            {ledger.notes?.ar && (
              <p dir="rtl" className="text-white/80">
                <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white/50" dir="ltr">
                  AR
                </span>
                {ledger.notes.ar}
              </p>
            )}
            {ledger.notes?.ar_to_en && (
              <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-[12px] text-cyan-100/75">
                <span className="mr-1.5 inline-flex items-center gap-1 font-semibold tracking-wider text-cyan-300">
                  <Languages className="h-3 w-3" />
                  AI TRANSLATION
                </span>
                {ledger.notes.ar_to_en}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Right column: ledger table */}
      <section className="glass h-fit rounded-[1.5rem] p-5">
        <SectionTitle hint="status + full provenance per attribute">
          Attribute Ledger
        </SectionTitle>
        <div className="space-y-2.5">
          {rows.map(([attr, row]) => (
            <div
              key={attr}
              className="glass-deep rounded-2xl p-4 transition-shadow duration-300 hover:shadow-[0_0_24px_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold tracking-wide text-white/90">
                  {attr.replace(/_/g, " ")}
                </p>
                <StatusChip status={row.status} />
              </div>
              <p
                className={`mt-1.5 text-lg font-medium tracking-tight ${
                  row.value == null ? "text-white/30" : "text-white"
                }`}
              >
                {row.value == null
                  ? "— unresolved —"
                  : String(row.value)}
              </p>
              {(row.candidates?.length ?? 0) > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {row.candidates.map((c, i) => (
                    <SourceBadge
                      key={i}
                      source={c.source}
                      sourceRef={c.source_ref}
                    />
                  ))}
                </div>
              )}
              {row.status !== "VERIFIED" && (
                <button
                  onClick={() => {
                    const v = window.prompt(
                      `Confirm "${attr.replace(/_/g, " ")}" as the seller (current candidate: ${row.value ?? "none"}). Enter the verified value:`,
                      row.value ?? "",
                    );
                    if (v !== null && v !== "") onConfirm(attr, v);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-[11px] font-semibold text-teal-200 transition-all duration-300 hover:bg-teal-400/20"
                >
                  <UserCheck className="h-3 w-3" />
                  Confirm as seller
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
      {[0, 1].map((i) => (
        <div key={i} className="glass animate-pulse rounded-[1.5rem] p-5">
          <div className="h-3.5 w-32 rounded bg-white/10" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-14 rounded-2xl bg-white/5" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
