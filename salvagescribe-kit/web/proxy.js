// middleware.js — Supabase session refresh + route protection.
// Unauthenticated visitors land on /login; logged-in users skip /login.

import { createServerClient } from "@supabase/ssr";
import { safeNext } from "./lib/auth-redirect.js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const PUBLIC_PATHS = ["/login", "/auth"];

export async function proxy(request) {
  let response = NextResponse.next({ request });

  // Supabase not configured → run open (demo mode still works standalone)
  if (!SUPABASE_URL || !SUPABASE_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  try { ({ data: { user } } = await supabase.auth.getUser()); } catch { /* APIs check their own session too. */ }

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path.startsWith("/parts/") || path === "/marketglass" || path === "/marketglass/index.html" || (path.startsWith("/marketglass/") && /\.(css|js)$/.test(path)) || path.startsWith("/api/") || PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(c => redirect.cookies.set(c));
    return redirect;
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    const redirect = NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    response.cookies.getAll().forEach(c => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and the Supabase auth callback exchanges handled in routes
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
