"use client";

// components/DraftTab.jsx — editable eBay-standard listing draft.
// Guardrails: blocked states (G3/G4), unverified fitment banner, ≤80-char
// title, and the human-in-the-loop approval gate (never auto-published).

import { useEffect, useState } from "react";
import {
  FileText,
  Lock,
  ShieldAlert,
  RefreshCw,
  Save,
  BadgeCheck,
  Car,
  ListChecks,
  Tag,
} from "lucide-react";
import { SectionTitle, UnverifiedBanner } from "./ui.jsx";

export default function DraftTab({
  partId,
  draft,
  draftStale,
  classification,
  onRefresh,
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (draft?.draft) {
      setTitle(draft.draft.title ?? "");
      setDescription(draft.draft.description_markdown ?? "");
      setDirty(false);
    }
  }, [draft]);

  if (!draft) {
    return (
      <div className="glass animate-pulse rounded-[1.5rem] p-8">
        <div className="h-4 w-48 rounded bg-white/10" />
        <div className="mt-4 h-24 rounded-2xl bg-white/5" />
      </div>
    );
  }

  async function saveEdits() {
    setSaving(true);
    try {
      await fetch(`/api/parts/${partId}/draft/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description_markdown: description }),
      });
      setDirty(false);
      setNotice("Manual edits stored — they survive regeneration.");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setApproving(true);
    try {
      const res = await fetch(`/api/parts/${partId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.approved) {
        setApproved(true);
        onRefresh?.();
      } else {
        setNotice(data.detail ?? "Approval gate refused — resolve blockers first.");
      }
    } finally {
      setApproving(false);
    }
  }

  /* Blocked states: guardrails G3 / G4 */
  if (draft.blocked) {
    return (
      <div className="glass rounded-[1.5rem] p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-400/10">
          <Lock className="h-6 w-6 text-rose-300" />
        </span>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">
          Draft blocked by guardrail {draft.guardrail}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
          {draft.reason ??
            "Unverified condition data prevents honest disclosure. Confirm the outstanding damage attributes before a draft can be generated."}
        </p>
        {(draft.blocking ?? []).length > 0 && (
          <div className="mx-auto mt-5 max-w-md space-y-2 text-left">
            {draft.blocking.map((b, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] text-white/70"
              >
                <ShieldAlert className="mr-2 inline h-3.5 w-3.5 text-amber-300" />
                {typeof b === "string" ? b : b.attribute ?? JSON.stringify(b)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const d = draft.draft;
  const specifics = d.item_specifics ?? {};
  const canApprove = classification === "READY_FOR_REVIEW" && !approved;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
      {/* Main draft editor */}
      <div className="space-y-5">
        {draftStale && (
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            Ledger changed — regenerating the draft from the single source of truth…
          </div>
        )}
        {approved && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            Approved by Noor — held in draft state for final seller review.
            Nothing is auto-published.
          </div>
        )}
        {notice && (
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
            {notice}
          </div>
        )}

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint={`${title.length}/80 characters`}>
            <span className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-white/40" />
              SEO Title
            </span>
          </SectionTitle>
          <input
            value={title}
            maxLength={140}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className={`w-full rounded-xl border bg-white/5 px-4 py-3 text-[15px] font-medium tracking-tight text-white focus:outline-none ${
              title.length > 80
                ? "border-rose-400/50"
                : "border-white/15 focus:border-cyan-400/50"
            }`}
          />
          {title.length > 80 && (
            <p className="mt-1.5 text-[11px] font-medium text-rose-300">
              eBay P&A titles are capped at 80 characters.
            </p>
          )}

          <div className="mt-5">
            <SectionTitle>Description (transparent used-condition)</SectionTitle>
            <textarea
              value={description}
              rows={12}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[13px] leading-relaxed text-white/90 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] text-white/35">
              Guardrails applied:{" "}
              {(draft.guardrails_applied ?? [])
                .map((g) => g.id ?? g)
                .join(" · ") || "G1–G6"}
            </p>
            <button
              onClick={saveEdits}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-transform duration-300 hover:scale-[1.03] disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save edits"}
            </button>
          </div>
        </section>

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint="eBay structured data">
            <span className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-white/40" />
              Item Specifics
            </span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(specifics).map(([k, v]) => (
              <div
                key={k}
                className="glass-deep rounded-xl px-4 py-2.5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {k.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-medium text-white/85">
                  {v == null || v === "" ? "—" : String(v)}
                </p>
              </div>
            ))}
            <div className="glass-deep rounded-xl px-4 py-2.5 sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Recommended eBay category
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-white/85">
                {d.category_suggestion ?? "—"}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Side column: condition + compatibility + approval */}
      <div className="space-y-5">
        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle>Condition Disclosure</SectionTitle>
          <div className="space-y-2">
            {Object.entries(d.condition_disclosure ?? {}).map(([k, v]) => (
              <div
                key={k}
                className="glass-deep rounded-xl px-4 py-2.5 text-[13px]"
              >
                <span className="font-semibold capitalize text-white/70">
                  {k}:
                </span>{" "}
                <span className="text-white/85">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint="strict donor separation">
            <span className="flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-white/40" />
              Compatibility
            </span>
          </SectionTitle>

          <div className="glass-deep rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Donor vehicle (recorded)
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-white/85">
              {d.compatibility?.donor_vehicle_recorded ?? "—"}
            </p>
          </div>

          {(d.compatibility?.confirmed_fitment ?? []).length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                Confirmed fitment (part-number matched)
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {d.compatibility.confirmed_fitment.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100"
                  >
                    {f.make ?? ""} {f.model ?? ""} {f.years ?? f.year ?? ""}{" "}
                    {f.note ? `· ${f.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-3">
              <UnverifiedBanner
                message={
                  d.compatibility?.unverified_statement ??
                  "Fitment: unverified. Donor vehicle recorded as stated. Confirm by part number before purchase."
                }
              />
            </div>
          )}
        </section>

        <section className="glass rounded-[1.5rem] p-5">
          <SectionTitle hint="T-03 gate">Human Approval</SectionTitle>
          <button
            onClick={approve}
            disabled={!canApprove || approving}
            className={`w-full rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-300 ${
              approved
                ? "cursor-default border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : canApprove
                  ? "bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-900 shadow-lg shadow-emerald-400/25 hover:scale-[1.02]"
                  : "cursor-not-allowed border border-white/10 bg-white/5 text-white/35"
            }`}
          >
            {approved
              ? "Approved — held as draft"
              : approving
                ? "Checking gate…"
                : canApprove
                  ? "Approve draft for final review"
                  : "Approval locked — resolve readiness blockers"}
          </button>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/35">
            <FileText className="mt-0.5 h-3 w-3 shrink-0" />
            Listings are never auto-published. Approval records the seller's
            explicit sign-off inside the prototype only.
          </p>
        </section>
      </div>
    </div>
  );
}
