import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;

function mockOpenRouter(toolArgs: Record<string, unknown>) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "report_label_fields",
                    arguments: JSON.stringify(toolArgs),
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("extractLabel — OpenRouter integration", () => {
  it("normalises producer name + address into one string", async () => {
    globalThis.fetch = mockOpenRouter({
      brand_name: "OLD TOM DISTILLERY",
      class_type: "Bourbon",
      alcohol_content: "45% Alc./Vol.",
      net_contents: "750 mL",
      producer_name: "Old Tom Distillery",
      producer_address: "Bardstown, KY",
      country_of_origin: "",
      government_warning: "GOVERNMENT WARNING: ...",
      warning_header_in_all_caps: true,
      warning_header_is_bold: true,
      beverage_class: "spirits",
      notes: "",
    }) as unknown as typeof fetch;

    const { extractLabel } = await import("./extract");
    const out = await extractLabel("AAAA", "image/jpeg");

    expect(out.producer).toBe("Old Tom Distillery, Bardstown, KY");
    expect(out.beverageClass).toBe("spirits");
    expect(out.warningStartsWithCapsHeader).toBe(true);
    expect(out.warningHeaderIsBold).toBe(true);
    expect(out.notes).toBeNull();
    expect(out.originCountry).toBeNull();
  });

  it("coerces empty strings to null", async () => {
    globalThis.fetch = mockOpenRouter({
      brand_name: "",
      class_type: "",
      alcohol_content: "",
      net_contents: "",
      producer_name: "",
      producer_address: "",
      country_of_origin: "",
      government_warning: "",
      warning_header_in_all_caps: false,
      warning_header_is_bold: false,
      beverage_class: "unknown",
      notes: "",
    }) as unknown as typeof fetch;

    const { extractLabel } = await import("./extract");
    const out = await extractLabel("AAAA", "image/jpeg");

    expect(out.brandName).toBeNull();
    expect(out.producer).toBeNull();
    expect(out.governmentWarning).toBeNull();
    expect(out.beverageClass).toBe("unknown");
  });

  it("defaults unrecognised beverage_class to 'unknown'", async () => {
    globalThis.fetch = mockOpenRouter({
      brand_name: "X",
      class_type: "X",
      alcohol_content: "1%",
      net_contents: "1 mL",
      producer_name: "X",
      producer_address: "",
      country_of_origin: "",
      government_warning: "",
      warning_header_in_all_caps: false,
      warning_header_is_bold: false,
      beverage_class: "cider",
      notes: "",
    }) as unknown as typeof fetch;

    const { extractLabel } = await import("./extract");
    const out = await extractLabel("AAAA", "image/jpeg");
    expect(out.beverageClass).toBe("unknown");
  });

  it("throws a helpful error when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { extractLabel } = await import("./extract");
    await expect(extractLabel("AAAA", "image/jpeg")).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
  });

  it("surfaces upstream HTTP errors with context", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    ) as unknown as typeof fetch;
    const { extractLabel } = await import("./extract");
    await expect(extractLabel("AAAA", "image/jpeg")).rejects.toThrow(/429/);
  });

  it("throws when the model returns no tool call", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "I refuse." } }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const { extractLabel } = await import("./extract");
    await expect(extractLabel("AAAA", "image/jpeg")).rejects.toThrow(
      /structured tool output/i,
    );
  });

  it("throws on malformed tool arguments JSON", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "report_label_fields",
                      arguments: "{not valid json",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const { extractLabel } = await import("./extract");
    await expect(extractLabel("AAAA", "image/jpeg")).rejects.toThrow(/JSON/);
  });
});
