import { NextResponse } from "next/server";
import { extractLabel } from "@/lib/extract";
import { compareFields, overallStatus } from "@/lib/compare";
import type { LabelApplication, VerifyResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function parseApplication(raw: unknown): LabelApplication | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const required = ["brandName", "classType", "alcoholContent", "netContents", "producer"];
  for (const key of required) {
    if (typeof p[key] !== "string" || !(p[key] as string).trim()) return null;
  }
  return {
    brandName: (p.brandName as string).trim(),
    classType: (p.classType as string).trim(),
    alcoholContent: (p.alcoholContent as string).trim(),
    netContents: (p.netContents as string).trim(),
    producer: (p.producer as string).trim(),
    originCountry:
      typeof p.originCountry === "string" && p.originCountry.trim()
        ? (p.originCountry as string).trim()
        : undefined,
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const image = form.get("image");
  const application = parseApplication(form.get("application"));

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Missing image file" },
      { status: 400 },
    );
  }
  if (!application) {
    return NextResponse.json(
      { error: "Missing or invalid application data" },
      { status: 400 },
    );
  }
  if (!ACCEPTED_TYPES.has(image.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${image.type || "unknown"}` },
      { status: 415 },
    );
  }
  if (image.size > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image exceeds 8 MB limit" },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const b64 = bytes.toString("base64");

  try {
    const extracted = await extractLabel(
      b64,
      image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    );
    const results = compareFields(application, extracted);
    const overall = overallStatus(results);
    const response: VerifyResponse = {
      extracted,
      results,
      overall,
      latencyMs: Date.now() - started,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
