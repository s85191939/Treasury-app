"use client";

import { useEffect, useRef, useState } from "react";
import type { BeverageClass, LabelApplication, VerifyResponse } from "@/lib/types";
import { BEVERAGE_LABELS } from "@/lib/types";
import { VerificationResult } from "./VerificationResult";

const SAMPLE: LabelApplication = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
  producer: "Old Tom Distillery, Bardstown, KY",
  beverageClass: "spirits",
};

interface Demo {
  label: string;
  expects: "pass" | "review" | "fail";
  image: string;
  application: LabelApplication;
}

const DEMOS: Demo[] = [
  {
    label: "Spirits — clean label (should pass)",
    expects: "pass",
    image: "/samples/old-tom.jpg",
    application: SAMPLE,
  },
  {
    label: "Spirits — title-case warning header (should fail)",
    expects: "fail",
    image: "/samples/altered-warning.jpg",
    application: SAMPLE,
  },
  {
    label: "Wine — Bordeaux with country of origin (should pass)",
    expects: "pass",
    image: "/samples/chateau-margaux.jpg",
    application: {
      brandName: "Chateau Margaux",
      classType: "Red Wine",
      alcoholContent: "13% Alc./Vol.",
      netContents: "750 mL",
      producer: "Chateau Margaux, Margaux, France",
      originCountry: "France",
      beverageClass: "wine",
    },
  },
  {
    label: "Wine under 14% — ABV omitted (should pass via exemption)",
    expects: "pass",
    image: "/samples/wine-low-abv-missing.jpg",
    application: {
      brandName: "MEADOWBROOK CELLARS",
      classType: "Chardonnay",
      alcoholContent: "12.5% Alc./Vol.",
      netContents: "750 mL",
      producer: "Meadowbrook Cellars, Sonoma, CA",
      beverageClass: "wine",
    },
  },
  {
    label: "Beer — IPA (should pass, ABV optional)",
    expects: "pass",
    image: "/samples/beer-ipa.jpg",
    application: {
      brandName: "HOPYARD BREWING CO.",
      classType: "West Coast India Pale Ale",
      alcoholContent: "6.8% Alc./Vol.",
      netContents: "355 mL",
      producer: "Hopyard Brewing Co., Portland, OR",
      beverageClass: "beer",
    },
  },
  {
    label: "Spirits — wrong ABV (should fail)",
    expects: "fail",
    image: "/samples/wrong-abv.jpg",
    application: SAMPLE,
  },
];

async function fetchImageAsFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sample (${res.status})`);
  const blob = await res.blob();
  const filename = url.split("/").pop() ?? "sample.jpg";
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export function SingleVerifier() {
  const [form, setForm] = useState<LabelApplication>(SAMPLE);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File | null) {
    setImage(file);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function update<K extends keyof LabelApplication>(
    key: K,
    value: LabelApplication[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function loadDemo(demo: Demo) {
    setError(null);
    setResult(null);
    setForm(demo.application);
    try {
      const file = await fetchImageAsFile(demo.image);
      handleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load demo");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!image) {
      setError("Please upload a label image.");
      return;
    }
    setError(null);
    setLoading(true);
    setLoadingStage("Reading the label…");
    setResult(null);
    const stageTimer = window.setTimeout(
      () => setLoadingStage("Comparing fields to application…"),
      1500,
    );
    try {
      const fd = new FormData();
      fd.append("image", image);
      fd.append("application", JSON.stringify(form));
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Verification failed.");
      } else {
        setResult(json as VerifyResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      window.clearTimeout(stageTimer);
      setLoading(false);
      setLoadingStage("");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            1. Application data
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter the fields from the COLA application as submitted — or load
            one of the included samples.
          </p>
        </div>

        <div className="rounded-xl bg-indigo-50/60 p-3 ring-1 ring-inset ring-indigo-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Try a sample
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.image}
                type="button"
                onClick={() => loadDemo(d)}
                disabled={loading}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                title={d.label}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">
              Beverage Type <span className="text-rose-500">*</span>
            </span>
            <select
              value={form.beverageClass}
              onChange={(e) =>
                update("beverageClass", e.target.value as BeverageClass)
              }
              className="mt-1 block w-full rounded-lg border-0 bg-slate-50 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            >
              <option value="spirits">{BEVERAGE_LABELS.spirits}</option>
              <option value="wine">{BEVERAGE_LABELS.wine}</option>
              <option value="beer">{BEVERAGE_LABELS.beer}</option>
              <option value="unknown">Not sure</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Different rules apply per type — e.g. wine under 14% can omit ABV.
            </span>
          </label>

          <Field
            label="Brand Name"
            value={form.brandName}
            onChange={(v) => update("brandName", v)}
            required
          />
          <Field
            label="Class / Type"
            value={form.classType}
            onChange={(v) => update("classType", v)}
            required
          />
          <Field
            label="Alcohol Content"
            value={form.alcoholContent}
            placeholder="e.g. 45% Alc./Vol."
            onChange={(v) => update("alcoholContent", v)}
            required
          />
          <Field
            label="Net Contents"
            value={form.netContents}
            placeholder="e.g. 750 mL"
            onChange={(v) => update("netContents", v)}
            required
          />
          <Field
            label="Producer / Bottler"
            value={form.producer}
            onChange={(v) => update("producer", v)}
            className="sm:col-span-2"
            required
          />
          <Field
            label="Country of Origin (imports only)"
            value={form.originCountry ?? ""}
            onChange={(v) => update("originCountry", v)}
            className="sm:col-span-2"
          />
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h2 className="text-lg font-semibold text-slate-900">
            2. Label image
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            JPEG, PNG, WebP, or GIF. Up to 8 MB.
          </p>

          <label
            htmlFor="single-image"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              isDragging
                ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                : "border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {image ? (
              <span className="text-sm font-medium text-slate-700">
                {image.name}
                <span className="ml-2 text-xs text-slate-500">
                  ({(image.size / 1024).toFixed(0)} KB)
                </span>
              </span>
            ) : (
              <span className="text-sm">
                <span className="font-medium text-indigo-600">
                  Click to choose
                </span>{" "}
                or drop an image here
              </span>
            )}
            <input
              ref={fileInputRef}
              id="single-image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Label preview"
              className="mt-4 max-h-72 w-full rounded-lg object-contain ring-1 ring-slate-200"
            />
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || !image}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Verifying…" : "Verify label"}
        </button>
      </form>

      <div>
        {loading ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-200">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {loadingStage || "Working…"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Typical labels return in 2-3 seconds.
              </p>
            </div>
          </div>
        ) : result ? (
          <VerificationResult result={result} />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center text-slate-500">
            <p className="text-sm">
              Results will appear here once you submit an application and label.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-lg border-0 bg-slate-50 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500"
      />
    </label>
  );
}
