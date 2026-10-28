"use client";

// components/ClarifyTab.jsx — GLM-5-powered clarification chat.
// Targeted questions (conflicts, unreadable part numbers, damage, testing,
// shipping dims) with one-tap answers that propagate through the system.

import { useEffect, useRef, useState } from "react";
import {
  MessagesSquare,
  SendHorizonal,
  Sparkles,
  ShieldAlert,
  Quote,
} from "lucide-react";

export default function ClarifyTab({ partId, questions, onConfirm }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "I flag gaps and conflicts across your sources. Answer a question below, or ask me anything — I can never edit the ledger myself.",
    },
  ]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [otherFor, setOtherFor] = useState(null);
  const [otherValue, setOtherValue] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(text) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setAsking(true);
    try {
      const res = await fetch(`/api/parts/${partId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply ?? data.error ?? "…",
          guardrail: data.guardrail_refusal ?? false,
          suggested_attribute: data.suggested_attribute ?? null,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Connection failed — try again.", guardrail: true },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function answer(q, value) {
    setOtherFor(null);
    onConfirm(q.attribute, value);
  }

  const qs = questions?.questions ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Targeted questions */}
      <section className="glass h-fit rounded-[1.5rem] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
            <MessagesSquare className="h-4 w-4 text-amber-300" />
            Open Questions
          </h3>
          <span className="text-[11px] text-white/35">
            {qs.length ? `${qs.length} need your input` : "all clear"}
          </span>
        </div>

        {!questions && <div className="h-24 animate-pulse rounded-2xl bg-white/5" />}

        {questions && qs.length === 0 && (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-emerald-300" />
            <p className="mt-2 text-sm font-medium text-emerald-200">
              Every attribute is seller-verified.
            </p>
            <p className="mt-1 text-xs text-emerald-200/60">
              The draft is ready for your review.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {qs.map((q, i) => (
            <div
              key={q.question_id}
              className="glass-deep fade-up rounded-2xl p-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className="text-sm font-medium leading-snug text-white/90">
                {q.text}
              </p>
              {q.why && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/40">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                  {q.why}
                </p>
              )}
              {q.evidence?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.evidence.map((e, j) => (
                    <span
                      key={j}
                      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/45"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(q.options ?? []).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => answer(q, opt)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300 hover:scale-[1.04] ${
                      opt === "Other"
                        ? "border-white/15 bg-white/5 text-white/60"
                        : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {otherFor === q.question_id && (
                <div className="mt-2.5 flex gap-2">
                  <input
                    autoFocus
                    value={otherValue}
                    onChange={(e) => setOtherValue(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && answer(q, otherValue)
                    }
                    placeholder="Type the correct value…"
                    className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:outline-none"
                  />
                  <button
                    onClick={() => answer(q, otherValue)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    Confirm
                  </button>
                </div>
              )}
              {q.options?.includes("Other") && otherFor !== q.question_id && (
                <button
                  onClick={() => {
                    setOtherFor(q.question_id);
                    setOtherValue("");
                  }}
                  className="mt-2 text-[11px] font-medium text-white/35 underline-offset-2 hover:text-white/70 hover:underline"
                >
                  None of these — type my own
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Free-text assistant */}
      <section className="glass flex h-fit flex-col rounded-[1.5rem] p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/40 to-cyan-400/30">
            <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
          </span>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
            Ask SalvageScribe
          </h3>
        </div>

        <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`fade-up max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-white text-slate-900"
                  : m.guardrail
                    ? "border border-rose-400/25 bg-rose-400/10 text-rose-100"
                    : "glass-deep text-white/85"
              }`}
            >
              {m.guardrail && (
                <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-rose-300">
                  <ShieldAlert className="h-3 w-3" />
                  GUARDRAIL · READ-ONLY
                </span>
              )}
              {m.text}
            </div>
          ))}
          {asking && (
            <div className="glass-deep flex w-16 items-center justify-center gap-1 rounded-2xl px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: `${d * 120}ms` }}
                />
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="e.g. Is this mirror compatible with a 2019 Corolla?"
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            onClick={() => ask(input)}
            disabled={asking || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 transition-transform duration-300 hover:scale-105 disabled:opacity-40"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/30">
          The assistant is read-only: it cannot certify authenticity, guarantee
          fitment, infer function from photos, or change the ledger.
        </p>
      </section>
    </div>
  );
}
