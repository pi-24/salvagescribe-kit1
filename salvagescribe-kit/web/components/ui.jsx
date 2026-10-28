"use client";

// components/ui.jsx — shared glass design-system primitives

import {
  FileSpreadsheet,
  NotebookPen,
  Camera,
  ScanLine,
  UserCheck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  MinusCircle,
} from "lucide-react";

/* ── Classification pill ─────────────────────────────────────────────────── */

const CLASS_STYLES = {
  READY_FOR_REVIEW: {
    label: "Ready for Seller Review",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_18px_0_rgba(52,211,153,0.25)]",
  },
  INFO_MISSING: {
    label: "Information Missing",
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_18px_0_rgba(251,191,36,0.25)]",
  },
  SPECIALIST_REVIEW: {
    label: "Specialist Review Required",
    chip: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
    glow: "shadow-[0_0_18px_0_rgba(251,113,133,0.25)]",
  },
};

export function ClassPill({ classification, size = "sm" }) {
  const s = CLASS_STYLES[classification] ?? CLASS_STYLES.INFO_MISSING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium tracking-wide ${s.chip} ${
        size === "sm" ? "text-[11px]" : "text-xs px-3 py-1"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export const CLASS_META = CLASS_STYLES;

/* ── Ledger status chip ──────────────────────────────────────────────────── */

const STATUS_STYLES = {
  VERIFIED: {
    icon: CheckCircle2,
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  PARTIAL: {
    icon: AlertTriangle,
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  CONFLICTING: {
    icon: XCircle,
    chip: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  },
  MISSING: {
    icon: CircleDashed,
    chip: "border-white/20 bg-white/5 text-white/50",
  },
  UNVERIFIABLE: {
    icon: MinusCircle,
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
};

export function StatusChip({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.MISSING;
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider ${s.chip}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

/* ── Source attribution badge (provenance) ───────────────────────────────── */

const SOURCE_META = {
  spreadsheet: {
    icon: FileSpreadsheet,
    label: "Spreadsheet",
    chip: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  dismantling_note: {
    icon: NotebookPen,
    label: "Arabic Note",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  photo: {
    icon: Camera,
    label: "Photo",
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
  photo_label: {
    icon: ScanLine,
    label: "Photo OCR",
    chip: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
  },
  seller_confirmed: {
    icon: UserCheck,
    label: "Seller Confirmed",
    chip: "border-teal-400/40 bg-teal-400/15 text-teal-200",
  },
  model_inference: {
    icon: Sparkles,
    label: "AI Inferred",
    chip: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  },
};

export function SourceBadge({ source, sourceRef }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.model_inference;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
      title={sourceRef ?? meta.label}
    >
      <span
        className={`inline-flex items-center gap-1 rounded px-1 py-px ${meta.chip}`}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {meta.label}
      </span>
      {sourceRef && (
        <span className="truncate text-white/40">{sourceRef}</span>
      )}
    </span>
  );
}

export { SOURCE_META };

/* ── Trust boundary banner ───────────────────────────────────────────────── */

export function UnverifiedBanner({ message }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div>
        <p className="text-xs font-semibold tracking-wider text-amber-300">
          UNVERIFIED / BUYER TO VERIFY
        </p>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
          {message}
        </p>
      </div>
    </div>
  );
}

/* ── Section heading ─────────────────────────────────────────────────────── */

export function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/60">
        {children}
      </h3>
      {hint && <span className="text-[11px] text-white/35">{hint}</span>}
    </div>
  );
}
