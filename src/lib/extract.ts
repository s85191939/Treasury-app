import type { ExtractedLabel } from "./types";

const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = `You are an expert assistant for the U.S. Alcohol and Tobacco Tax and Trade Bureau (TTB) label compliance program. You read photographs or scans of alcohol beverage labels and extract the regulated fields exactly as they appear.

TTB labels must include: brand name, class/type designation, alcohol content, net contents, name and address of bottler/producer, country of origin for imports, and the mandatory Government Health Warning Statement (27 CFR 16.21).

The canonical Government Warning text is:
"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."

You always answer by calling the report_label_fields tool. Capture text verbatim — preserve original capitalization, punctuation, and spacing.

CRITICAL — case fidelity for the Government Warning:
- Copy the warning text character-for-character as printed. Do NOT auto-correct case.
- If the label says "Government Warning:" in mixed case, you MUST return "Government Warning:" — never normalise to all caps.
- The warning_header_in_all_caps boolean is true ONLY if the very first characters on the label are the literal uppercase string "GOVERNMENT WARNING:". A title-case "Government Warning:" or lowercase variant means warning_header_in_all_caps=false.
- A downstream compliance check rejects labels with the wrong case. Returning all caps when the label is title case will cause a regulatory miss.

For other fields, extract the visible text. If a field is not visible on the label, return an empty string for that field. Do not guess.`;

const TOOL_DEF = {
  type: "function" as const,
  function: {
    name: "report_label_fields",
    description: "Report the fields extracted from the alcohol beverage label image.",
    parameters: {
      type: "object",
      properties: {
        brand_name: {
          type: "string",
          description:
            "Brand name as printed on the label. Empty string if not visible.",
        },
        class_type: {
          type: "string",
          description:
            "Class/type designation, e.g. 'Kentucky Straight Bourbon Whiskey', 'Cabernet Sauvignon', 'India Pale Ale'. Empty string if not visible.",
        },
        alcohol_content: {
          type: "string",
          description:
            "Alcohol-by-volume as printed, e.g. '45% Alc./Vol. (90 Proof)'. Empty string if not visible.",
        },
        net_contents: {
          type: "string",
          description:
            "Net contents as printed, e.g. '750 mL', '12 FL OZ'. Empty string if not visible.",
        },
        producer_name: {
          type: "string",
          description:
            "Name of the bottler, distiller, or producer as printed. Empty string if not visible.",
        },
        producer_address: {
          type: "string",
          description:
            "Address of the producer/bottler if printed. Empty string if not visible.",
        },
        country_of_origin: {
          type: "string",
          description:
            "Country of origin if printed (typically required for imports). Empty string if not visible.",
        },
        government_warning: {
          type: "string",
          description:
            "The full Government Warning statement as it appears on the label, verbatim. Preserve capitalization and punctuation. Empty string if not present.",
        },
        warning_header_in_all_caps: {
          type: "boolean",
          description:
            "True iff the warning text begins with the exact characters 'GOVERNMENT WARNING:' in all uppercase, as TTB requires.",
        },
        notes: {
          type: "string",
          description:
            "Optional brief notes about image quality, occlusion, or anything an agent should review manually. Empty string if nothing to flag.",
        },
      },
      required: [
        "brand_name",
        "class_type",
        "alcohol_content",
        "net_contents",
        "producer_name",
        "producer_address",
        "country_of_origin",
        "government_warning",
        "warning_header_in_all_caps",
        "notes",
      ],
      additionalProperties: false,
    },
  },
};

function emptyToNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
      content?: string;
    };
  }>;
  error?: { message?: string; code?: number | string };
}

export async function extractLabel(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<ExtractedLabel> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local before running.",
    );
  }

  const dataUrl = `data:${mediaType};base64,${imageBase64}`;
  const referer = process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000";

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "TTB Label Verifier",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
            {
              type: "text",
              text: "Extract the regulated TTB label fields from this image. Return the verbatim Government Warning text if present.",
            },
          ],
        },
      ],
      tools: [TOOL_DEF],
      tool_choice: {
        type: "function",
        function: { name: "report_label_fields" },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenRouter request failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as OpenRouterResponse;
  if (data.error) {
    throw new Error(
      `OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`,
    );
  }
  const message = data.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error(
      "Model did not return structured tool output. Try a model with tool/function-call support.",
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Could not parse model tool arguments as JSON");
  }

  const producerName = emptyToNull(raw.producer_name);
  const producerAddress = emptyToNull(raw.producer_address);
  const producer = [producerName, producerAddress]
    .filter((v): v is string => Boolean(v))
    .join(", ");

  return {
    brandName: emptyToNull(raw.brand_name),
    classType: emptyToNull(raw.class_type),
    alcoholContent: emptyToNull(raw.alcohol_content),
    netContents: emptyToNull(raw.net_contents),
    producer: producer.length > 0 ? producer : null,
    originCountry: emptyToNull(raw.country_of_origin),
    governmentWarning: emptyToNull(raw.government_warning),
    warningStartsWithCapsHeader: Boolean(raw.warning_header_in_all_caps),
    notes: emptyToNull(raw.notes),
  };
}
