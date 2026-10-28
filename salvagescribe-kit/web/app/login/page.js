"use client";

// app/login/page.js — glassy Supabase auth: sign in / sign up (email+password)

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Mail, LockKeyhole, LoaderCircle, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser.js";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (authError) {
        setError(authError.message);
      } else if (mode === "signup") {
        // Sessions start immediately unless email confirmation is required
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          router.push("/");
          router.refresh();
        } else {
          setInfo("Check your inbox — confirm your email to activate the account.");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Authentication service unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-up flex min-h-[70vh] items-center justify-center">
      <div className="glass w-full max-w-md rounded-[2rem] p-8">
        <div className="mb-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
            Sign in to SalvageScribe — guardrailed listings await your approval.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <label className="glass-deep flex items-center gap-3 rounded-2xl px-4 py-3">
            <Mail className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="noor@salvage.ae"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
          </label>
          <label className="glass-deep flex items-center gap-3 rounded-2xl px-4 py-3">
            <LockKeyhole className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs text-cyan-100">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-white/10 transition-all duration-300 hover:scale-[1.02] disabled:opacity-60"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-center text-[13px] text-white/45 transition-colors hover:text-white/80"
        >
          {mode === "signin"
            ? "No account yet? Create one"
            : "Already registered? Sign in"}
        </button>

        <p className="mt-6 flex items-start justify-center gap-1.5 text-center text-[11px] leading-relaxed text-white/30">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Supabase Auth · sessions are httpOnly-cookie based
        </p>
        <p className="mt-3 text-center text-[11px] text-white/30">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← back to board
          </Link>
        </p>
      </div>
    </div>
  );
}
