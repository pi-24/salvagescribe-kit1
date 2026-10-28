"use client";

// components/Workspace.jsx — detail workspace: owns all data flows.
//
// Single-source-of-truth propagation: one seller confirmation re-fetches the
// ledger, readiness checklist and listing draft together, so a single answer
// instantly reclassifies the part and updates every downstream surface.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Fingerprint,
  MessagesSquare,
  FileText,
  ClipboardCheck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { ClassPill } from "./ui.jsx";
import ProvenanceTab from "./ProvenanceTab.jsx";
import ClarifyTab from "./ClarifyTab.jsx";
import DraftTab from "./DraftTab.jsx";
import ReadinessTab from "./ReadinessTab.jsx";

const TABS = [
  { key: "provenance", label: "Provenance Ledger", icon: Fingerprint },
  { key: "clarify", label: "Clarification", icon: MessagesSquare },
  { key: "draft", label: "Listing Draft", icon: FileText },
  { key: "readiness", label: "Readiness", icon: ClipboardCheck },
];

export default function Workspace({ partId }) {
  const [tab, setTab] = useState("provenance");
  const [ledger, setLedger] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftStale, setDraftStale] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [propagated, setPropagated] = useState(false);
  const [error, setError] = useState(null);

  const fetchJson = useCallback(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
  }, []);

  const refreshAll = useCallback(
    async ({ includeDraft = true } = {}) => {
      setSyncing(true);
      try {
        const jobs = [
          fetchJson(`/api/parts/${partId}`),
          fetchJson(`/api/parts/${partId}/readiness`),
          fetchJson(`/api/parts/${partId}/questions`),
        ];
        if (includeDraft) {
          jobs.push(
            fetchJson(`/api/parts/${partId}/draft`).then((d) => {
              setDraftStale(false);
              return d;
            }),
          );
        }
        const [led, ready, qs, dr] = await Promise.all(jobs);
        setLedger(led);
        setReadiness(ready);
        setQuestions(qs);
        if (dr !== undefined) setDraft(dr);
      } catch (err) {
        setError(err.message);
      } finally {
        setSyncing(false);
      }
    },
    [partId, fetchJson],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // GLM-5 ingestion pass (photos + notes + spreadsheet → ledger).
      // In demo mode this resolves instantly from canned responses.
      try {
        await fetch(`/api/parts/${partId}/ingest`, { method: "POST" });
      } catch {
        /* ingest is best-effort; the loader-seeded ledger still renders */
      }
      if (!cancelled) refreshAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll, partId]);

  // One confirmation → propagate everywhere (the core demo moment)
  async function handleConfirm(attribute, value, lang = "en") {
    setSyncing(true);
    try {
      const res = await fetch(`/api/parts/${partId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attribute, value, lang }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Confirm failed");
      const { ledger: updated } = await res.json();
      setLedger(updated);
      setDraftStale(true);
      await refreshAll();
      setPropagated(true);
      setTimeout(() => setPropagated(false), 2600);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const classification = ledger?.classification;

  return (
    <div className="fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/45 transition-colors hover:text-white/80"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Board
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {ledger?.spreadsheet_row?.description ?? partId}
            </h1>
            {classification && <ClassPill classification={classification} size="lg" />}
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-white/40">
            <Fingerprint className="h-3.5 w-3.5" />
            {partId} · every attribute carries explicit source attribution
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
            propagated
              ? "sync-pulse border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-white/40"
          }`}
        >
          {propagated ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Propagated → ledger · draft · checklist
            </>
          ) : syncing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Syncing…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Single source of truth in sync
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="glass mt-7 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-300 ${
                active
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-white/55 hover:text-white/90"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === "clarify" && questions?.questions?.length > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-amber-400/20 text-amber-300"
                  }`}
                >
                  {questions.questions.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="mt-6">
        {tab === "provenance" && (
          <ProvenanceTab ledger={ledger} onConfirm={handleConfirm} />
        )}
        {tab === "clarify" && (
          <ClarifyTab
            partId={partId}
            questions={questions}
            onConfirm={handleConfirm}
          />
        )}
        {tab === "draft" && (
          <DraftTab
            partId={partId}
            draft={draft}
            draftStale={draftStale}
            classification={classification}
            onRefresh={() => refreshAll()}
          />
        )}
        {tab === "readiness" && (
          <ReadinessTab
            readiness={readiness}
            classification={classification}
            partId={partId}
            onApproved={() => refreshAll({ includeDraft: false })}
          />
        )}
      </div>
    </div>
  );
}
