import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from "@/lib/supabase.js";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!isSupabaseConfigured) return Response.json({ signupEnabled: false }, { status: 503, headers });
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Auth settings unavailable");
    const settings = await response.json();
    return Response.json({ signupEnabled: settings.external?.email === true && settings.disable_signup !== true, emailConfirmationRequired: settings.mailer_autoconfirm !== true }, { headers });
  } catch {
    return Response.json({ signupEnabled: false }, { status: 503, headers });
  }
}
