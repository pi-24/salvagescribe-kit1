// lib/supabase.js — Supabase clients (browser, server, middleware) + audit.
//
// Auth uses @supabase/ssr cookie-based sessions so the middleware, server
// components and route handlers all see the same logged-in identity, and
// RLS policies on the prototype tables evaluate against that identity.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

/** Server-side: route handlers, server components (cookie-aware → RLS-aware) */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a server component — middleware refreshes sessions.
        }
      },
    },
  });
}

/** Best-effort AI audit-trail entry (never throws into the request path) */
export async function logAudit(supabase, entry) {
  if (!supabase) return;
  try {
    await supabase.from("ai_audit_trail").insert({
      part_id: entry.part_id ?? null,
      operation: entry.operation,
      model: entry.model ?? "glm-5",
      mock: entry.mock ?? false,
      payload: entry.payload ?? null,
    });
  } catch (err) {
    console.error("Supabase audit insert failed:", err.message);
  }
}
