"use client";

// components/ReadinessTab.jsx — versioned UAE→UK readiness checklist with
// tri-state classification. Internal operational checklist only — it presents
// no legal or customs advice (guardrail 4).

import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertOctagon,
  ArrowRight,
} from "lucide-react";
import { ClassPill, CLASS_META } from "./ui.jsx";

const RULE_ICON = {
  PASS: CheckCircle2,
  FAIL: XCircle,
  NA: MinusCircle,
};

const RULE_COLOR = {
  PASS: "text-emerald-300",
  FAIL: "text-rose-300",
  NA: "text-white/30",
};

export default function ReadinessTab({
  readiness,
  classification,
  partId,
  onApproved,
}) {
  if (!readiness) {
    return (
      <div className="glass animate-pulse rounded-[1.5rem] p-8">
        <div className="h-4 w-56 rounded bg-white/10" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const meta = CLASS_META[classification] ?? CLASS_META.INFO_MISSING;
  const failed = (readiness.rules ?? []).filter((r) => r.result === "FAIL");
  const actions = readiness.actions ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
      {/* Checklist */}
      <section className="glass rounded-[1.5rem] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
            <ClipboardCheck className="h-4 w-4 text-white/40" />
            UAE → UK Readiness Checklist
          </h3>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/50">
            {readiness.checklist_version ?? "checklist v1"}
          </span>
        </div>

        {/* Banner */}
        <div
          className={`mb-5 rounded-2xl border p-4 ${meta.chip.replace("text-", "text-")} bg-opacity-10`}
          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight">
              {readiness.banner ?? meta.label}
            </p>
            <ClassPill classification={classification} />
          </div>
          {readiness.blocking_rule && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/60">
              <AlertOctagon className="h-3.5 w-3.5 text-rose-300" />
              Blocking rule: {readiness.blocking_rule}
            </p>
          )}
        </div>

        <div className="space-y-2">
          {(readiness.rules ?? []).map((r, i) => {
            const Icon = RULE_ICON[r.result] ?? MinusCircle;
            return (
              <div
                key={r.id ?? i}
                className="glass-deep flex items-center gap-3.5 rounded-xl px-4 py-3"
              >
                <Icon className={`h-4 w-4 shrink-0 ${RULE_COLOR[r.result] ?? ""}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-white/85">
                    <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-white/50">
                      {r.id}
                    </span>
                    {r.detail}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold tracking-widest ${RULE_COLOR[r.result] ?? ""}`}
                >
                  {r.result}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <section className="glass h-fit rounded-[1.5rem] p-5">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
          Next Actions
        </h3>
        {actions.length === 0 && failed.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-300" />
            <p className="mt-2 text-sm font-medium text-emerald-200">
              All required checks pass.
            </p>
            <p className="mt-1 text-xs text-emerald-200/60">
              Head to the Listing Draft tab to approve.
            </p>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {(actions.length ? actions : failed).map((a, i) => {
              const text =
                typeof a === "string"
                  ? a
                  : a.action ?? a.detail ?? `${a.id} failed`;
              return (
                <li
                  key={i}
                  className="fade-up glass-deep flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[10px] font-bold text-amber-300">
                    {i + 1}
                  </span>
                  <p className="text-[13px] leading-relaxed text-white/80">
                    {text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-5 flex items-start gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] leading-relaxed text-white/35">
          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
          Internal operational checklist only — not legal, customs, or
          compliance advice. Parts are limited to non-hazardous categories.
        </p>
      </section>
    </div>
  );
}
