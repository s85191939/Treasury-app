"use client";

import { useState } from "react";
import { SingleVerifier } from "@/components/SingleVerifier";
import { BatchVerifier } from "@/components/BatchVerifier";

type Mode = "single" | "batch";

export default function Home() {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            TTB · Label Compliance Prototype
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Alcohol Label Verifier
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Upload a label photograph and the application data, and the system
            will read the label, compare each regulated field, and flag
            anything that needs an agent&apos;s eyes.
          </p>
        </div>
        <a
          href="https://www.ttb.gov/labeling"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          TTB labeling guidelines ↗
        </a>
      </header>

      <div className="mb-6 inline-flex w-fit rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200">
        <TabButton
          active={mode === "single"}
          onClick={() => setMode("single")}
        >
          Single label
        </TabButton>
        <TabButton active={mode === "batch"} onClick={() => setMode("batch")}>
          Batch (CSV + images)
        </TabButton>
      </div>

      {mode === "single" ? <SingleVerifier /> : <BatchVerifier />}

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
        Prototype only — no data is stored. Vision extraction is routed
        through OpenRouter. Results require an agent to confirm before any
        compliance action.
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
