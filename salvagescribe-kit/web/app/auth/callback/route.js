// app/auth/callback/route.js — Supabase email-confirmation / OAuth exchange

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch (err) {
      console.error("Auth callback exchange failed:", err.message);
    }
  }
  return NextResponse.redirect(origin);
}
