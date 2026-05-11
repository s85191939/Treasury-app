import type { FieldStatus } from "@/lib/types";

const STYLES: Record<FieldStatus | "review", string> = {
  pass: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  fail: "bg-rose-100 text-rose-800 ring-rose-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  missing: "bg-rose-100 text-rose-800 ring-rose-200",
  "n/a": "bg-slate-200 text-slate-700 ring-slate-300",
  review: "bg-amber-100 text-amber-800 ring-amber-200",
};

const LABELS: Record<FieldStatus | "review", string> = {
  pass: "Pass",
  fail: "Fail",
  warning: "Review",
  missing: "Missing",
  "n/a": "Not required",
  review: "Needs review",
};

const ICONS: Record<FieldStatus | "review", string> = {
  pass: "✓",
  fail: "✕",
  warning: "!",
  missing: "?",
  "n/a": "—",
  review: "!",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: FieldStatus | "review";
  size?: "sm" | "md";
}) {
  const pad = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset ${pad} ${STYLES[status]}`}
    >
      <span aria-hidden>{ICONS[status]}</span>
      {LABELS[status]}
    </span>
  );
}
