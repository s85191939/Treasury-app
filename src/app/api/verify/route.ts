import { NextResponse } from "next/server";
import { extractLabel } from "@/lib/extract";
import { compareFields, overallStatus } from "@/lib/compare";
import type { BeverageClass, LabelApplication, VerifyResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VALID_CLASSES: ReadonlySet<BeverageClass> = new Set([
  "spirits",
  "wine",
  "beer",
  "unknown",
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
  const beverageClass =
    typeof p.beverageClass === "string" &&
    VALID_CLASSES.has(p.beverageClass as BeverageClass)
      ? (p.beverageClass as BeverageClass)
      : "unknown";
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
    beverageClass,
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read the upload. Try again." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  const application = parseApplication(form.get("application"));

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Please attach a label image." },
      { status: 400 },
    );
  }
  if (!application) {
    return NextResponse.json(
      {
        error:
          "Application data is missing or incomplete. Brand, class/type, alcohol, net contents, and producer are required.",
      },
      { status: 400 },
    );
  }
  if (!ACCEPTED_TYPES.has(image.type)) {
    return NextResponse.json(
      {
        error: `That file type isn't supported (${image.type || "unknown"}). Please upload a JPEG, PNG, WebP, or GIF.`,
      },
      { status: 415 },
    );
  }
  if (image.size > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image is too large. Please keep it under 8 MB." },
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
    if (message.includes("OPENROUTER_API_KEY")) {
      return NextResponse.json(
        {
          error:
            "Server is not configured: OPENROUTER_API_KEY is missing. Ask the administrator to set it.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: `Couldn't read this label: ${message}` },
      { status: 502 },
    );
  }
}
