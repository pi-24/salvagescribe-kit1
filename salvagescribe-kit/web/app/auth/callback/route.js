import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase.js";
import { safeNext } from "@/lib/auth-redirect.js";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  try {
    const client = await createSupabaseServerClient();
    const code = searchParams.get("code");
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    let result;
    if (code) result = await client.auth.exchangeCodeForSession(code);
    else if (token_hash && ["email", "signup", "invite", "magiclink", "email_change"].includes(type)) result = await client.auth.verifyOtp({ token_hash, type });
    if (result && !result.error && result.data?.session) return NextResponse.redirect(new URL(next, origin));
  } catch { /* Display an actionable error on the account page. */ }
  const failed = new URL("/login", origin);
  failed.searchParams.set("error", "confirmation_failed");
  failed.searchParams.set("next", next);
  return NextResponse.redirect(failed);
}
