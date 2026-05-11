import type { VerifyResponse } from "@/lib/types";
import { BEVERAGE_LABELS } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function VerificationResult({ result }: { result: VerifyResponse }) {
  const overallLabel =
    result.overall === "pass"
      ? "All checks passed"
      : result.overall === "fail"
        ? "Issues found"
        : "Needs review";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {overallLabel}
          </h2>
          <p className="text-sm text-slate-500">
            Read in {(result.latencyMs / 1000).toFixed(1)}s ·{" "}
            {BEVERAGE_LABELS[result.extracted.beverageClass]}
          </p>
        </div>
        <StatusBadge status={result.overall} size="md" />
      </div>

      {result.extracted.notes ? (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong className="font-semibold">Reviewer note from the model:</strong>{" "}
          {result.extracted.notes}
          <p className="mt-1 text-xs text-amber-800">
            Consider requesting a clearer photograph before final adjudication.
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Application</th>
              <th className="px-4 py-3 font-medium">On label</th>
              <th className="px-4 py-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.results.map((r) => (
              <tr key={r.field}>
                <td className="px-4 py-3 font-medium text-slate-700 align-top">
                  {r.label}
                </td>
                <td className="px-4 py-3 text-slate-600 align-top">
                  {r.field === "governmentWarning" ? (
                    <span className="text-xs text-slate-400">
                      Required canonical text
                    </span>
                  ) : (
                    r.expected || <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-900 align-top">
                  {r.found ? (
                    <span className="whitespace-pre-wrap break-words">
                      {r.found}
                    </span>
                  ) : (
                    <span className="text-slate-400">Not detected</span>
                  )}
                  {r.field === "governmentWarning" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <FormatBadge
                        ok={result.extracted.warningStartsWithCapsHeader}
                        label="ALL CAPS"
                      />
                      <FormatBadge
                        ok={result.extracted.warningHeaderIsBold}
                        label="Bold weight"
                      />
                    </div>
                  ) : null}
                  {r.note ? (
                    <p className="mt-1 text-xs text-slate-500">{r.note}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormatBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        ok
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-rose-200"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {label}
    </span>
  );
}
