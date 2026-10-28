// lib/supabase-browser.js — browser-only Supabase client.
// Kept separate from lib/supabase.js so client components never pull in the
// server-only `next/headers` dependency.

import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseBrowserConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

export function createSupabaseBrowserClient() {
  if (!isSupabaseBrowserConfigured) throw new Error("Authentication is not configured. Set the Supabase URL and public key.");
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
