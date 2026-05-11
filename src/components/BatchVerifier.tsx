"use client";

import { useMemo, useState } from "react";
import { parseCsv } from "@/lib/csv";
import type { LabelApplication, VerifyResponse } from "@/lib/types";
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
  "origin_country",
];

const SAMPLE_CSV = `filename,brand_name,class_type,alcohol_content,net_contents,producer,origin_country
example.jpg,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,"Old Tom Distillery, Bardstown, KY",`;

function appFromCsvRow(row: Record<string, string>): LabelApplication | null {
  const required = ["brand_name", "class_type", "alcohol_content", "net_contents", "producer"];
  for (const k of required) if (!row[k]) return null;
  return {
    brandName: row.brand_name,
    classType: row.class_type,
    alcoholContent: row.alcohol_content,
    netContents: row.net_contents,
    producer: row.producer,
    originCountry: row.origin_country || undefined,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function pull() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, pull);
  await Promise.all(runners);
  return results;
}

export function BatchVerifier() {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const summary = useMemo(() => {
    let pass = 0;
    let review = 0;
    let fail = 0;
    let done = 0;
    for (const r of rows) {
      if (r.state.status === "done") {
        done++;
        if (r.state.result.overall === "pass") pass++;
        else if (r.state.result.overall === "review") review++;
        else fail++;
      }
    }
    return { pass, review, fail, done, total: rows.length };
  }, [rows]);

  async function handleCsv(file: File | null) {
    if (!file) return;
    setError(null);
    const text = await file.text();
    const records = parseCsv(text);
    if (records.length === 0) {
      setError("CSV is empty or has no rows.");
      return;
    }
    const missing = CSV_HEADERS.slice(0, 6).filter(
      (h) => !(h in records[0]),
    );
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
    for (const f of Array.from(list)) {
      map.set(f.name, f);
    }
    setFiles(map);
    setRows((prev) =>
      prev.map((r) => ({ ...r, file: map.get(r.filename) ?? r.file })),
    );
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
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], state: { status: "running" } };
        return next;
      });
      try {
        const fd = new FormData();
        fd.append("image", row.file!);
        fd.append("application", JSON.stringify(row.application));
        const res = await fetch("/api/verify", { method: "POST", body: fd });
        const json = await res.json();
        setRows((prev) => {
          const next = [...prev];
          if (!res.ok) {
            next[idx] = {
              ...next[idx],
              state: { status: "error", error: json.error ?? "Failed" },
            };
          } else {
            next[idx] = {
              ...next[idx],
              state: { status: "done", result: json as VerifyResponse },
            };
          }
          return next;
        });
      } catch (err) {
        setRows((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            state: {
              status: "error",
              error: err instanceof Error ? err.message : "Network error",
            },
          };
          return next;
        });
      }
    });

    setRunning(false);
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
            class_type, alcohol_content, net_contents, producer.
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
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>
                <strong className="font-semibold text-slate-900">
                  {rows.length}
                </strong>{" "}
                applications loaded
              </span>
              {summary.done > 0 ? (
                <span className="flex gap-2">
                  <Pill label={`${summary.pass} pass`} tone="pass" />
                  <Pill label={`${summary.review} review`} tone="warning" />
                  <Pill label={`${summary.fail} fail`} tone="fail" />
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={runBatch}
              disabled={running}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {running ? "Running…" : "Verify all"}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <BatchRowView
                    key={idx}
                    row={row}
                    expanded={expanded === idx}
                    onToggle={() => setExpanded(expanded === idx ? null : idx)}
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

function BatchRowView({
  row,
  expanded,
  onToggle,
}: {
  row: BatchRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = row.state.status;
  return (
    <>
      <tr>
        <td className="px-4 py-3 font-mono text-xs text-slate-600">
          {row.filename}
        </td>
        <td className="px-4 py-3 text-slate-700">{row.application.brandName}</td>
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
            <span className="text-xs text-indigo-600">Running…</span>
          ) : status === "error" ? (
            <span className="text-xs text-rose-700">
              {row.state.error}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Pending</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {status === "done" ? (
            <button
              type="button"
              onClick={onToggle}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              {expanded ? "Hide" : "Details"}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded && row.state.status === "done" ? (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-4 py-4">
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
