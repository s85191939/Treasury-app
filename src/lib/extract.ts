import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedLabel } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an expert assistant for the U.S. Alcohol and Tobacco Tax and Trade Bureau (TTB) label compliance program. You read photographs or scans of alcohol beverage labels and extract the regulated fields exactly as they appear.

TTB labels must include: brand name, class/type designation, alcohol content, net contents, name and address of bottler/producer, country of origin for imports, and the mandatory Government Health Warning Statement (27 CFR 16.21).

The canonical Government Warning text is:
"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."

You always return ONLY a tool call. Capture text verbatim as it appears on the label — preserve original capitalization, punctuation, and spacing for the government warning so a downstream comparator can do a strict check. For other fields, extract the visible text. If a field is not visible, return null. Do not guess.`;

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "report_label_fields",
    description:
      "Report the fields extracted from the alcohol beverage label image.",
    input_schema: {
      type: "object",
      properties: {
        brand_name: {
          type: ["string", "null"],
          description: "Brand name as printed on the label.",
        },
        class_type: {
          type: ["string", "null"],
          description:
            "Class/type designation, e.g. 'Kentucky Straight Bourbon Whiskey', 'Cabernet Sauvignon', 'India Pale Ale'.",
        },
        alcohol_content: {
          type: ["string", "null"],
          description:
            "Alcohol-by-volume as printed, e.g. '45% Alc./Vol. (90 Proof)' or '12.5% ABV'.",
        },
        net_contents: {
          type: ["string", "null"],
          description:
            "Net contents as printed, e.g. '750 mL', '12 FL OZ', '1.75 L'.",
        },
        producer_name: {
          type: ["string", "null"],
          description:
            "Name of the bottler, distiller, or producer as printed.",
        },
        producer_address: {
          type: ["string", "null"],
          description: "Address of the producer/bottler if printed.",
        },
        country_of_origin: {
          type: ["string", "null"],
          description:
            "Country of origin if printed (typically required for imports).",
        },
        government_warning: {
          type: ["string", "null"],
          description:
            "The full Government Warning statement as it appears on the label, verbatim. Preserve capitalization and punctuation. Null if not present.",
        },
        warning_header_in_all_caps: {
          type: "boolean",
          description:
            "True iff the warning text begins with the exact characters 'GOVERNMENT WARNING:' in all uppercase, as TTB requires.",
        },
        notes: {
          type: ["string", "null"],
          description:
            "Optional brief notes about image quality, occlusion, or anything an agent should review manually.",
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
];

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before running.",
    );
  }
  return new Anthropic({ apiKey });
}

export async function extractLabel(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<ExtractedLabel> {
  const anthropic = client();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: "tool", name: "report_label_fields" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Extract the regulated TTB label fields from this image. Return the verbatim Government Warning text if present.",
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Model did not return structured label data");
  }
  const raw = toolBlock.input as Record<string, unknown>;

  const combinedProducer = [raw.producer_name, raw.producer_address]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(", ");

  return {
    brandName: (raw.brand_name as string | null) ?? null,
    classType: (raw.class_type as string | null) ?? null,
    alcoholContent: (raw.alcohol_content as string | null) ?? null,
    netContents: (raw.net_contents as string | null) ?? null,
    producer: combinedProducer.length > 0 ? combinedProducer : null,
    originCountry: (raw.country_of_origin as string | null) ?? null,
    governmentWarning: (raw.government_warning as string | null) ?? null,
    warningStartsWithCapsHeader: Boolean(raw.warning_header_in_all_caps),
    notes: (raw.notes as string | null) ?? null,
  };
}
