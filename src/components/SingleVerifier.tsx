"use client";

import { useRef, useState } from "react";
import type { LabelApplication, VerifyResponse } from "@/lib/types";
import { VerificationResult } from "./VerificationResult";

const SAMPLE: LabelApplication = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
  producer: "Old Tom Distillery, Bardstown, KY",
};

export function SingleVerifier() {
  const [form, setForm] = useState<LabelApplication>(SAMPLE);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | null) {
    setImage(file);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function update<K extends keyof LabelApplication>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!image) {
      setError("Please upload a label image.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", image);
      fd.append("application", JSON.stringify(form));
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Verification failed");
      } else {
        setResult(json as VerifyResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
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
            Enter the fields from the COLA application as submitted.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
            JPEG, PNG, or WebP. Up to 8 MB.
          </p>

          <label
            htmlFor="single-image"
            className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500 hover:border-indigo-400 hover:bg-indigo-50"
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
              className="mt-4 max-h-64 w-full rounded-lg object-contain ring-1 ring-slate-200"
            />
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
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
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-200">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
              <p className="mt-3 text-sm">
                Reading label and comparing to application…
              </p>
            </div>
          </div>
        ) : result ? (
          <VerificationResult result={result} />
        ) : (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center text-slate-500">
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
