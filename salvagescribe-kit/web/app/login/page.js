"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient, isSupabaseBrowserConfigured } from "../../lib/supabase-browser.js";
import { safeNext } from "../../lib/auth-redirect.js";

export default function LoginPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) setError("Unable to complete sign-in. Sign in with your email and password, or browse as a guest.");
  }, []);
  const destination = () => safeNext(new URLSearchParams(window.location.search).get("next"));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setInfo("");
    if (mode === "signup" && password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/config", { cache: "no-store" });
        const config = await response.json();
        if (!response.ok || !config.signupEnabled || config.emailConfirmationRequired) {
          throw new Error("Account creation is temporarily unavailable. You can browse as a guest or sign in to an existing account.");
        }
      }
      const client = createSupabaseBrowserClient();
      const { data, error } = mode === "signin"
        ? await client.auth.signInWithPassword({ email: email.trim(), password })
        : await client.auth.signUp({ email: email.trim(), password });
      if (error) {
        if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code) || error.status === 429) {
          throw new Error("Account requests are temporarily limited. Continue as a guest or try signing in to an existing account later.");
        }
        throw error;
      }
      if (data.session) { window.location.assign(destination()); return; }
      if (mode === "signup") setInfo("No session was created. If you already have an account, sign in with your existing password. You can also continue as a guest.");
      else setError("A session could not be created. Please try signing in again.");
    } catch (err) { setError(err.message || "Unable to reach authentication. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><section className="glass auth-card">
    <span className="brand-icon">S</span><h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
    <p>Manage your salvage inventory, reconcile evidence and prepare listing drafts.</p>
    {!isSupabaseBrowserConfigured && <p className="auth-notice">Authentication needs the Supabase URL and public key in web/.env.local.</p>}
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={busy} />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} disabled={busy} />
      {mode === "signup" && <><label htmlFor="confirmation">Confirm password</label><input id="confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></>}
      {error && <p role="alert" className="auth-notice auth-error">{error}</p>}{info && <p role="status" className="auth-notice">{info}</p>}
      <button type="submit" disabled={busy || !isSupabaseBrowserConfigured}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setInfo(""); setPassword(""); setConfirmation(""); }}>{mode === "signin" ? "New here? Create an account" : "Already registered? Sign in"}</button>
    <p style={{ marginTop: 20 }}><Link href="/">Continue as a guest →</Link></p>
  </section></div>;
}
