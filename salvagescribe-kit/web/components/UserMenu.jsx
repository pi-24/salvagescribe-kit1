"use client";

// components/UserMenu.jsx — header identity chip + sign out (Supabase Auth)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, CircleUserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "../lib/supabase-browser.js";

export default function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (mounted) setUser(data.user ?? null);
        const { data: sub } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (mounted) setUser(session?.user ?? null);
          },
        );
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        /* Supabase not configured */
      }
    })();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!user) return null;

  const email = user.email ?? "signed in";

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-white/70 sm:flex">
        <CircleUserRound className="h-3.5 w-3.5 text-cyan-300" />
        {email}
      </span>
      <button
        onClick={signOut}
        title="Sign out"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/50 transition-all duration-300 hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-300"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
