"use client";

// app/page.js — Board: kanban by readiness classification + demo launchers

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  ShieldAlert,
  ArrowRight,
  PackageSearch,
  MessageSquareWarning,
  BadgeCheck,
} from "lucide-react";
import { ClassPill, CLASS_META } from "../components/ui.jsx";

const COLUMNS = [
  { key: "READY_FOR_REVIEW", icon: BadgeCheck },
  { key: "INFO_MISSING", icon: MessageSquareWarning },
  { key: "SPECIALIST_REVIEW", icon: ShieldAlert },
];

export default function BoardPage() {
  const router = useRouter();
  const [board, setBoard] = useState(null);
  const [launching, setLaunching] = useState(null);

  useEffect(() => {
    fetch("/api/parts")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => setBoard({ count: 0, parts: [] }));
  }, []);

  async function launchDemo(kind) {
    setLaunching(kind);
    if (kind === "difficult") {
      router.push("/parts/MIR-004");
      return;
    }
    try {
      const res = await fetch("/api/demo/normal");
      const { part_id } = await res.json();
      router.push(`/parts/${part_id}`);
    } catch {
      setLaunching(null);
    }
  }

  const parts = board?.parts ?? [];
  const counts = Object.fromEntries(
    COLUMNS.map((c) => [
      c.key,
      parts.filter((p) => p.classification === c.key).length,
    ]),
  );

  return (
    <div className="fade-up">
      {/* Hero */}
      <section className="glass relative overflow-hidden rounded-[2rem] p-8 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
          eBay Salvage Yard → Global Marketplace · Hackathon Prototype
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Fragmented inventory in.
          <br />
          <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-cyan-200 bg-clip-text text-transparent">
            Guardrailed listings out.
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
          SalvageScribe reconciles spreadsheets, Arabic dismantling notes and
          photo evidence into a provenance-tracked ledger — then drafts
          eBay-compliant listings with strict trust boundaries.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={() => launchDemo("normal")}
            disabled={launching !== null}
            className="group inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-white/10 transition-all duration-300 hover:scale-[1.03] hover:shadow-white/20 disabled:opacity-60"
          >
            <Play className="h-4 w-4 fill-slate-900" />
            {launching === "normal" ? "Loading…" : "Demo · Normal Journey"}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => launchDemo("difficult")}
            disabled={launching !== null}
            className="glass glass-hover inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          >
            <ShieldAlert className="h-4 w-4 text-rose-300" />
            {launching === "difficult"
              ? "Loading…"
              : "Demo · The Difficult Case — MIR-004"}
          </button>
        </div>
      </section>

      {/* Kanban */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {COLUMNS.map(({ key, icon: Icon }, colIdx) => {
          const meta = CLASS_META[key];
          const colParts = parts.filter((p) => p.classification === key);
          return (
            <section
              key={key}
              className="glass fade-up rounded-[1.75rem] p-5"
              style={{ animationDelay: `${colIdx * 90}ms` }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border ${meta.chip}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-[13px] font-semibold tracking-wide text-white/85">
                    {meta.label}
                  </h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-white/60">
                  {counts[key] ?? 0}
                </span>
              </div>

              <div className="space-y-3">
                {!board && (
                  <SkeletonCard />
                )}
                {board && colParts.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
                    Nothing here
                  </p>
                )}
                {colParts.map((p) => (
                  <button
                    key={p.part_id}
                    onClick={() => router.push(`/parts/${p.part_id}`)}
                    className="glass-deep glass-hover group block w-full rounded-2xl p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-white/90">
                          {p.title}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-white/45">
                          <PackageSearch className="h-3.5 w-3.5" />
                          {p.part_id}
                          {p.exclusion_flag && (
                            <span className="rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-px font-semibold text-rose-300">
                              NON-HAZARDOUS RULE FAIL
                            </span>
                          )}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-white/60" />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <ClassPill classification={p.classification} />
                      {p.open_questions > 0 && (
                        <span className="text-[11px] font-medium text-amber-300/80">
                          {p.open_questions} open attribute
                          {p.open_questions === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-deep animate-pulse rounded-2xl p-4">
      <div className="h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-3 h-3 w-1/3 rounded bg-white/5" />
    </div>
  );
}
