import "./globals.css";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import UserMenu from "../components/UserMenu.jsx";

export const metadata = {
  title: "SalvageScribe — UAE → UK Parts Intelligence",
  description:
    "AI assistant that turns fragmented salvage inventory into accurate, guardrailed eBay listing drafts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden />
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/40 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <Link href="/" className="group flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-105">
                <Sparkles className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight">
                  SalvageScribe
                </span>
                <span className="block text-[11px] font-normal tracking-wide text-white/50">
                  Dubai → UK · Parts Intelligence
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <UserMenu />
              <span
                id="llm-badge"
                className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-emerald-300 sm:block"
              >
                GLM-5 Engine
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-white/60">
                Drafts only · Human approval required
              </span>
              <a
                href="/marketglass/index.html"
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300 transition-colors hover:bg-cyan-400/20 lg:block"
              >
                MarketGlass UI ↗
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 pb-24 pt-10">{children}</main>
      </body>
    </html>
  );
}
