"use client";

import { useMemo, useState } from "react";
import { parseCsv } from "@/lib/csv";
import type { BeverageClass, LabelApplication, VerifyResponse } from "@/lib/types";
import { BEVERAGE_LABELS } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { VerificationResult } from "./VerificationResult";

type RowState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "done"; result: VerifyResponse }
  | { status: "error"; error: string };

interface BatchRow {
  filename: string;
  application: LabelApplication;
  file: File | null;
  state: RowState;
}

const CSV_HEADERS = [
  "filename",
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "producer",
  "beverage_class",
  "origin_country",
];

const SAMPLE_CSV = `filename,brand_name,class_type,alcohol_content,net_contents,producer,beverage_class,origin_country
old-tom.jpg,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,"Old Tom Distillery, Bardstown, KY",spirits,
chateau-margaux.jpg,Chateau Margaux,Red Wine,13% Alc./Vol.,750 mL,"Chateau Margaux, Margaux, France",wine,France
`;

const VALID_CLASSES: ReadonlySet<BeverageClass> = new Set([
  "spirits",
  "wine",
  "beer",
  "unknown",
]);

function appFromCsvRow(row: Record<string, string>): LabelApplication | null {
  const required = [
    "brand_name",
    "class_type",
    "alcohol_content",
    "net_contents",
    "producer",
  ];
  for (const k of required) if (!row[k]) return null;
  const beverageClass = (
    row.beverage_class && VALID_CLASSES.has(row.beverage_class as BeverageClass)
      ? row.beverage_class
      : "unknown"
  ) as BeverageClass;
  return {
    brandName: row.brand_name,
    classType: row.class_type,
    alcoholContent: row.alcohol_content,
    netContents: row.net_contents,
    producer: row.producer,
    originCountry: row.origin_country || undefined,
    beverageClass,
  };
}

async function verify(row: BatchRow): Promise<VerifyResponse> {
  const fd = new FormData();
  fd.append("image", row.file!);
  fd.append("application", JSON.stringify(row.application));
  const res = await fetch("/api/verify", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed");
  return json as VerifyResponse;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function pull() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, pull),
  );
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function BatchVerifier() {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "pass" | "review" | "fail">("all");

  const summary = useMemo(() => {
    let pass = 0;
    let review = 0;
    let fail = 0;
    let done = 0;
    let running = 0;
    for (const r of rows) {
      if (r.state.status === "done") {
        done++;
        if (r.state.result.overall === "pass") pass++;
        else if (r.state.result.overall === "review") review++;
        else fail++;
      } else if (r.state.status === "running") running++;
      else if (r.state.status === "error") fail++;
    }
    return { pass, review, fail, done, running, total: rows.length };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows.map((r, i) => ({ row: r, originalIndex: i }));
    return rows
      .map((r, i) => ({ row: r, originalIndex: i }))
      .filter(({ row }) => {
        if (row.state.status !== "done") return filter === "fail" && false;
        if (filter === "fail") return row.state.result.overall === "fail";
        if (filter === "review") return row.state.result.overall === "review";
        if (filter === "pass") return row.state.result.overall === "pass";
        return true;
      });
  }, [rows, filter]);

  async function handleCsv(file: File | null) {
    if (!file) return;
    setError(null);
    const text = await file.text();
    const records = parseCsv(text);
    if (records.length === 0) {
      setError("CSV is empty or has no rows.");
      return;
    }
    const minimumRequired = CSV_HEADERS.slice(0, 6);
    const missing = minimumRequired.filter((h) => !(h in records[0]));
    if (missing.length > 0) {
      setError(`CSV is missing required columns: ${missing.join(", ")}`);
      return;
    }
    const next: BatchRow[] = [];
    for (const rec of records) {
      const app = appFromCsvRow(rec);
      if (!app) continue;
      const filename = rec.filename;
      next.push({
        filename,
        application: app,
        file: files.get(filename) ?? null,
        state: { status: "pending" },
      });
    }
    setRows(next);
  }

  function handleImages(list: FileList | null) {
    if (!list) return;
    const map = new Map(files);
    for (const f of Array.from(list)) map.set(f.name, f);
    setFiles(map);
    setRows((prev) =>
      prev.map((r) => ({ ...r, file: map.get(r.filename) ?? r.file })),
    );
  }

  function setRowState(idx: number, state: RowState) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], state };
      return next;
    });
  }

  async function runOne(row: BatchRow, idx: number) {
    setRowState(idx, { status: "running" });
    try {
      const result = await verify(row);
      setRowState(idx, { status: "done", result });
    } catch (err) {
      setRowState(idx, {
        status: "error",
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function runBatch() {
    if (rows.length === 0) {
      setError("Upload a CSV first.");
      return;
    }
    const missing = rows.filter((r) => !r.file);
    if (missing.length > 0) {
      setError(
        `Missing images for: ${missing
          .slice(0, 3)
          .map((m) => m.filename)
          .join(", ")}${missing.length > 3 ? "…" : ""}`,
      );
      return;
    }
    setError(null);
    setRunning(true);
    setRows((prev) => prev.map((r) => ({ ...r, state: { status: "pending" } })));
    await runWithConcurrency(rows, 4, async (row, idx) => {
      await runOne(row, idx);
    });
    setRunning(false);
  }

  async function retry(idx: number) {
    const row = rows[idx];
    if (!row?.file) return;
    await runOne(row, idx);
  }

  function exportResults() {
    const header = [
      "filename",
      "brand_name",
      "beverage_class",
      "overall",
      "latency_ms",
      "brand_status",
      "class_status",
      "abv_status",
      "net_contents_status",
      "producer_status",
      "origin_status",
      "warning_status",
      "reviewer_notes",
      "error",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const fields: Record<string, string> = {
        filename: r.filename,
        brand_name: r.application.brandName,
        beverage_class: r.application.beverageClass,
        overall: "",
        latency_ms: "",
        brand_status: "",
        class_status: "",
        abv_status: "",
        net_contents_status: "",
        producer_status: "",
        origin_status: "",
        warning_status: "",
        reviewer_notes: "",
        error: "",
      };
      if (r.state.status === "done") {
        fields.overall = r.state.result.overall;
        fields.latency_ms = String(r.state.result.latencyMs);
        fields.reviewer_notes = r.state.result.extracted.notes ?? "";
        for (const fr of r.state.result.results) {
          if (fr.field === "brandName") fields.brand_status = fr.status;
          if (fr.field === "classType") fields.class_status = fr.status;
          if (fr.field === "alcoholContent") fields.abv_status = fr.status;
          if (fr.field === "netContents") fields.net_contents_status = fr.status;
          if (fr.field === "producer") fields.producer_status = fr.status;
          if (fr.field === "originCountry") fields.origin_status = fr.status;
          if (fr.field === "governmentWarning") fields.warning_status = fr.status;
        }
      } else if (r.state.status === "error") {
        fields.overall = "error";
        fields.error = r.state.error;
      }
      lines.push(header.map((h) => csvEscape(fields[h])).join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verification-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "applications-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            1. Upload application CSV
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            One row per label. Required columns: filename, brand_name,
            class_type, alcohol_content, net_contents, producer. Optional:
            beverage_class (spirits / wine / beer), origin_country.
          </p>
          <label
            htmlFor="batch-csv"
            className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50"
          >
            Choose CSV file
            <input
              id="batch-csv"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleCsv(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={downloadSample}
            className="mt-2 text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
          >
            Download sample CSV
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            2. Upload label images
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Images are matched to CSV rows by filename. Select multiple at once.
          </p>
          <label
            htmlFor="batch-images"
            className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50"
          >
            Add image files
            <input
              id="batch-images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(e) => handleImages(e.target.files)}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            {files.size} image{files.size === 1 ? "" : "s"} ready
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200"
        >
          {error}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>
                <strong className="font-semibold text-slate-900">
                  {summary.done + summary.running}
                </strong>{" "}
                / {summary.total} verified
              </span>
              {summary.done > 0 ? (
                <span className="flex gap-2">
                  <Pill label={`${summary.pass} pass`} tone="pass" />
                  <Pill label={`${summary.review} review`} tone="warning" />
                  <Pill label={`${summary.fail} fail`} tone="fail" />
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterTabs filter={filter} onChange={setFilter} />
              <button
                type="button"
                onClick={exportResults}
                disabled={summary.done === 0}
                className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-slate-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Export results CSV
              </button>
              <button
                type="button"
                onClick={runBatch}
                disabled={running}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {running ? "Running…" : "Verify all"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map(({ row, originalIndex }) => (
                  <BatchRowView
                    key={originalIndex}
                    row={row}
                    idx={originalIndex}
                    expanded={expanded === originalIndex}
                    onToggle={() =>
                      setExpanded(
                        expanded === originalIndex ? null : originalIndex,
                      )
                    }
                    onRetry={() => retry(originalIndex)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterTabs({
  filter,
  onChange,
}: {
  filter: "all" | "pass" | "review" | "fail";
  onChange: (f: "all" | "pass" | "review" | "fail") => void;
}) {
  const options: Array<{ value: typeof filter; label: string }> = [
    { value: "all", label: "All" },
    { value: "pass", label: "Pass" },
    { value: "review", label: "Review" },
    { value: "fail", label: "Fail" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
            filter === o.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BatchRowView({
  row,
  idx,
  expanded,
  onToggle,
  onRetry,
}: {
  row: BatchRow;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const status = row.state.status;
  return (
    <>
      <tr>
        <td className="px-4 py-3 font-mono text-xs text-slate-600">
          {row.filename}
        </td>
        <td className="px-4 py-3 text-slate-700">{row.application.brandName}</td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {BEVERAGE_LABELS[row.application.beverageClass]}
        </td>
        <td className="px-4 py-3 text-xs">
          {row.file ? (
            <span className="text-emerald-700">Ready</span>
          ) : (
            <span className="text-rose-700">Missing</span>
          )}
        </td>
        <td className="px-4 py-3">
          {status === "done" ? (
            <StatusBadge status={row.state.result.overall} />
          ) : status === "running" ? (
            <span className="inline-flex items-center gap-2 text-xs text-indigo-600">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              Reading label
            </span>
          ) : status === "error" ? (
            <span className="text-xs text-rose-700">{row.state.error}</span>
          ) : (
            <span className="text-xs text-slate-400">Pending</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-3 text-xs font-semibold">
            {status === "error" || status === "done" ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-slate-500 hover:text-slate-900 hover:underline"
                title="Re-run verification for this row"
              >
                Retry
              </button>
            ) : null}
            {status === "done" ? (
              <button
                type="button"
                onClick={onToggle}
                className="text-indigo-600 hover:underline"
                aria-expanded={expanded}
                aria-controls={`batch-row-${idx}-details`}
              >
                {expanded ? "Hide" : "Details"}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded && row.state.status === "done" ? (
        <tr id={`batch-row-${idx}-details`}>
          <td colSpan={6} className="bg-slate-50 px-4 py-4">
            <VerificationResult result={row.state.result} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "pass" | "warning" | "fail";
}) {
  const cls =
    tone === "pass"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
