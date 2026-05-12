import { describe, it, expect } from "vitest";
import {
  CANONICAL_WARNING,
  compareFields,
  overallStatus,
  parsePercent,
  parseVolumeMl,
  similarity,
} from "./compare";
import type { ExtractedLabel, LabelApplication } from "./types";

const APP: LabelApplication = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
  producer: "Old Tom Distillery, Bardstown, KY",
  beverageClass: "spirits",
};

function clean(over: Partial<ExtractedLabel> = {}): ExtractedLabel {
  return {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "45% Alc./Vol. (90 Proof)",
    netContents: "750 mL",
    producer: "Old Tom Distillery, Bardstown, KY",
    originCountry: null,
    governmentWarning: CANONICAL_WARNING,
    warningStartsWithCapsHeader: true,
    warningHeaderIsBold: true,
    beverageClass: "spirits",
    notes: null,
    ...over,
  };
}

function statusOf(field: string, app: LabelApplication, ex: ExtractedLabel) {
  const r = compareFields(app, ex).find((x) => x.field === field);
  if (!r) throw new Error(`no result for ${field}`);
  return r;
}

describe("similarity", () => {
  it("returns 1 for identical strings after normalization", () => {
    expect(similarity("Old Tom's", "OLD TOM'S")).toBeCloseTo(1);
    expect(similarity("STONE'S THROW", "Stone's Throw")).toBeCloseTo(1);
  });

  it("scales down with edits", () => {
    expect(similarity("HelloWorld", "HelloWorlz")).toBeGreaterThan(0.85);
    expect(similarity("HelloWorld", "Totally Different")).toBeLessThan(0.5);
  });

  // Regression: a buggy in-place Levenshtein corrupted prev[0] each iteration,
  // which made very different strings of mismatched length return inflated
  // similarity (e.g. "Vodka" vs "Kentucky Straight Bourbon Whiskey" came back
  // as 85%, putting a clear-mismatch class type into the Review band).
  it("rates very different strings of unequal length as near-zero similarity", () => {
    expect(
      similarity("Kentucky Straight Bourbon Whiskey", "Vodka"),
    ).toBeLessThan(0.2);
    expect(similarity("OLD TOM DISTILLERY", "SCRUFFY MOON")).toBeLessThan(0.2);
  });
});

describe("parsePercent", () => {
  it("parses ABV percent notations", () => {
    expect(parsePercent("45%")).toBe(45);
    expect(parsePercent("45.0% Alc./Vol.")).toBe(45);
    expect(parsePercent("12.5% ABV")).toBe(12.5);
  });
  it("parses proof to ABV", () => {
    expect(parsePercent("90 Proof")).toBe(45);
    expect(parsePercent("100 proof")).toBe(50);
  });
  it("parses bare number as percent", () => {
    expect(parsePercent("45")).toBe(45);
  });
  it("returns null for unparseable", () => {
    expect(parsePercent("not a number")).toBeNull();
    expect(parsePercent(null)).toBeNull();
  });
});

describe("parseVolumeMl", () => {
  it("converts common units to mL", () => {
    expect(parseVolumeMl("750 mL")).toBe(750);
    expect(parseVolumeMl("1.75 L")).toBe(1750);
    expect(parseVolumeMl("12 fl oz")).toBeCloseTo(354.88, 1);
    expect(parseVolumeMl("12 fl. oz.")).toBeCloseTo(354.88, 1);
    expect(parseVolumeMl("50 cL")).toBe(500);
  });
  it("handles bare number", () => {
    expect(parseVolumeMl("750")).toBe(750);
  });
  it("returns null for garbage", () => {
    expect(parseVolumeMl("a bottle")).toBeNull();
    expect(parseVolumeMl(null)).toBeNull();
  });
});

describe("compareFields — happy path", () => {
  it("passes a clean OLD TOM label", () => {
    const results = compareFields(APP, clean());
    expect(overallStatus(results)).toBe("pass");
  });
});

describe("compareFields — Dave's STONE'S THROW judgment", () => {
  it("case-only difference on brand is PASS, not FAIL", () => {
    const r = statusOf(
      "brandName",
      { ...APP, brandName: "Old Tom Distillery" },
      clean({ brandName: "OLD TOM DISTILLERY" }),
    );
    expect(r.status).toBe("pass");
  });

  it("punctuation-only difference on brand is PASS", () => {
    const r = statusOf(
      "brandName",
      { ...APP, brandName: "Stone's Throw" },
      clean({ brandName: "STONE'S THROW" }),
    );
    expect(r.status).toBe("pass");
  });
});

describe("compareFields — Government Warning strictness (Jenny's rule)", () => {
  it("PASSes when canonical text, all caps, bold", () => {
    const r = statusOf("governmentWarning", APP, clean());
    expect(r.status).toBe("pass");
  });

  it("FAILs when header is title case", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({
        governmentWarning: CANONICAL_WARNING.replace(
          "GOVERNMENT WARNING:",
          "Government Warning:",
        ),
        warningStartsWithCapsHeader: false,
      }),
    );
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/all caps/i);
  });

  it("flags as REVIEW (not fail) when header may not be bold — model bold-detection is unreliable on real photos", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({ warningHeaderIsBold: false }),
    );
    expect(r.status).toBe("warning");
    expect(r.note).toMatch(/bold/i);
  });

  it("FAILs when missing entirely", () => {
    const r = statusOf("governmentWarning", APP, clean({ governmentWarning: null }));
    expect(r.status).toBe("fail");
    expect(r.note).toMatch(/missing/i);
  });

  it("FAILs when wording deviates significantly", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({
        governmentWarning:
          "GOVERNMENT WARNING: Drinking too much is bad. Be careful out there.",
      }),
    );
    expect(r.status).toBe("fail");
  });
});

describe("compareFields — ABV tolerance", () => {
  it("PASS within 0.05%", () => {
    const r = statusOf(
      "alcoholContent",
      { ...APP, alcoholContent: "45.0%" },
      clean({ alcoholContent: "45% Alc./Vol." }),
    );
    expect(r.status).toBe("pass");
  });

  it("REVIEW between 0.05% and 0.3%", () => {
    const r = statusOf(
      "alcoholContent",
      { ...APP, alcoholContent: "45.0%" },
      clean({ alcoholContent: "45.2% Alc./Vol." }),
    );
    expect(r.status).toBe("warning");
  });

  it("FAIL beyond 0.3%", () => {
    const r = statusOf(
      "alcoholContent",
      { ...APP, alcoholContent: "45.0%" },
      clean({ alcoholContent: "50.5% Alc./Vol." }),
    );
    expect(r.status).toBe("fail");
  });

  it("understands proof", () => {
    const r = statusOf(
      "alcoholContent",
      { ...APP, alcoholContent: "90 Proof" },
      clean({ alcoholContent: "45% Alc./Vol." }),
    );
    expect(r.status).toBe("pass");
  });
});

describe("compareFields — beverage-type ABV exemption", () => {
  it("missing ABV is N/A for wine under 14%", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "wine",
        alcoholContent: "12% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        alcoholContent: null,
        beverageClass: "wine",
        classType: "Red Wine",
      }),
    );
    expect(r.status).toBe("n/a");
  });

  it("missing ABV on wine ≥14% is MISSING", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "wine",
        alcoholContent: "15% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        alcoholContent: null,
        beverageClass: "wine",
        classType: "Red Wine",
      }),
    );
    expect(r.status).toBe("missing");
  });

  it("missing ABV on beer is N/A", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "beer",
        alcoholContent: "5% Alc./Vol.",
        classType: "IPA",
      },
      clean({
        alcoholContent: null,
        beverageClass: "beer",
        classType: "IPA",
      }),
    );
    expect(r.status).toBe("n/a");
  });

  it("missing ABV on spirits is MISSING (never optional)", () => {
    const r = statusOf("alcoholContent", APP, clean({ alcoholContent: null }));
    expect(r.status).toBe("missing");
  });
});

describe("compareFields — volume tolerance", () => {
  it("PASS for exact match in different units", () => {
    const r = statusOf(
      "netContents",
      { ...APP, netContents: "0.75 L" },
      clean({ netContents: "750 mL" }),
    );
    expect(r.status).toBe("pass");
  });

  it("REVIEW within 2%", () => {
    const r = statusOf(
      "netContents",
      { ...APP, netContents: "750 mL" },
      clean({ netContents: "745 mL" }),
    );
    expect(r.status).toBe("warning");
  });

  it("FAIL beyond 2%", () => {
    const r = statusOf(
      "netContents",
      { ...APP, netContents: "750 mL" },
      clean({ netContents: "500 mL" }),
    );
    expect(r.status).toBe("fail");
  });
});

describe("compareFields — beverage class mismatch", () => {
  it("FAIL when expected spirits but label looks like wine", () => {
    const r = statusOf(
      "beverageClass",
      APP,
      clean({ beverageClass: "wine" }),
    );
    expect(r.status).toBe("fail");
  });

  it("REVIEW when model says unknown", () => {
    const r = statusOf(
      "beverageClass",
      APP,
      clean({ beverageClass: "unknown" }),
    );
    expect(r.status).toBe("warning");
  });

  it("not included when expected class is unknown", () => {
    const results = compareFields(
      { ...APP, beverageClass: "unknown" },
      clean(),
    );
    expect(results.find((r) => r.field === "beverageClass")).toBeUndefined();
  });
});

describe("compareFields — TTB Standards of Fill", () => {
  it("PASS on a standard 750 mL spirits fill", () => {
    const r = compareFields(APP, clean()).find(
      (x) => x.field === "standardsOfFill",
    );
    expect(r?.status).toBe("pass");
  });

  it("FAIL on a non-standard 800 mL spirits fill", () => {
    const results = compareFields(
      { ...APP, netContents: "800 mL" },
      clean({ netContents: "800 mL" }),
    );
    const r = results.find((x) => x.field === "standardsOfFill");
    expect(r?.status).toBe("fail");
    expect(r?.note).toMatch(/not a TTB-approved bottle size/i);
  });

  it("FAIL on 800 mL wine (not approved for wine either)", () => {
    const results = compareFields(
      {
        ...APP,
        beverageClass: "wine",
        netContents: "800 mL",
        alcoholContent: "12.5% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        netContents: "800 mL",
        beverageClass: "wine",
        alcoholContent: "12.5% Alc./Vol.",
        classType: "Red Wine",
      }),
    );
    const r = results.find((x) => x.field === "standardsOfFill");
    expect(r?.status).toBe("fail");
  });

  it("PASS on a wine-approved 250 mL (not on spirits list)", () => {
    const results = compareFields(
      {
        ...APP,
        beverageClass: "wine",
        netContents: "250 mL",
        alcoholContent: "12% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        netContents: "250 mL",
        beverageClass: "wine",
        alcoholContent: "12% Alc./Vol.",
        classType: "Red Wine",
      }),
    );
    const r = results.find((x) => x.field === "standardsOfFill");
    expect(r?.status).toBe("pass");
  });

  it("FAIL on 250 mL spirits (not on spirits list)", () => {
    const results = compareFields(
      { ...APP, netContents: "250 mL" },
      clean({ netContents: "250 mL" }),
    );
    const r = results.find((x) => x.field === "standardsOfFill");
    expect(r?.status).toBe("fail");
  });

  it("not included for beer (federal level does not regulate fill)", () => {
    const results = compareFields(
      {
        ...APP,
        beverageClass: "beer",
        netContents: "355 mL",
        classType: "IPA",
        alcoholContent: "5% Alc./Vol.",
      },
      clean({
        netContents: "355 mL",
        beverageClass: "beer",
        classType: "IPA",
        alcoholContent: "5% Alc./Vol.",
      }),
    );
    expect(
      results.find((x) => x.field === "standardsOfFill"),
    ).toBeUndefined();
  });
});

describe("overallStatus", () => {
  it("returns 'fail' when any field fails", () => {
    const results = compareFields(
      APP,
      clean({
        brandName: "WILD TURKEY",
      }),
    );
    expect(overallStatus(results)).toBe("fail");
  });

  it("returns 'review' when warnings only", () => {
    const results = compareFields(
      APP,
      clean({
        alcoholContent: "45.2% Alc./Vol.",
      }),
    );
    expect(overallStatus(results)).toBe("review");
  });

  it("'n/a' alone does NOT block a pass", () => {
    const results = compareFields(
      {
        ...APP,
        beverageClass: "wine",
        alcoholContent: "12% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        alcoholContent: null,
        beverageClass: "wine",
        classType: "Red Wine",
      }),
    );
    expect(overallStatus(results)).toBe("pass");
  });
});

describe("similarity — boundary cases", () => {
  it("returns 1 for two empty strings", () => {
    expect(similarity("", "")).toBe(1);
  });
  it("returns 0 when one side is empty and the other is not", () => {
    expect(similarity("Brand", "")).toBe(0);
    expect(similarity("", "Brand")).toBe(0);
  });
  it("collapses internal whitespace", () => {
    expect(similarity("Old   Tom", "Old Tom")).toBeCloseTo(1);
  });
  it("normalises curly quotes", () => {
    expect(similarity("Stone’s Throw", "Stone's Throw")).toBeCloseTo(1);
  });
});

describe("parsePercent — edge cases", () => {
  it("handles whitespace and decimal variants", () => {
    expect(parsePercent("   45.5  % ")).toBe(45.5);
    expect(parsePercent("45.50%")).toBe(45.5);
  });
  it("prefers percent over proof when both present", () => {
    expect(parsePercent("45% Alc./Vol. (90 Proof)")).toBe(45);
  });
  it("handles fractional proof", () => {
    expect(parsePercent("89.4 Proof")).toBeCloseTo(44.7);
  });
});

describe("parseVolumeMl — unit coverage", () => {
  it("is case-insensitive", () => {
    expect(parseVolumeMl("750 ML")).toBe(750);
    expect(parseVolumeMl("750 Ml")).toBe(750);
    expect(parseVolumeMl("12 FL OZ")).toBeCloseTo(354.88, 1);
  });
  it("handles comma thousands separators", () => {
    expect(parseVolumeMl("1,750 mL")).toBe(1750);
  });
  it("rejects ambiguous numbers without unit when other text present", () => {
    expect(parseVolumeMl("Bottle 750")).toBeNull();
  });
});

describe("compareFields — class/type fuzzy edge cases", () => {
  it("REVIEW when extracted class adds adjacent qualifier", () => {
    const r = statusOf(
      "classType",
      APP,
      clean({
        classType: "Premium Kentucky Straight Bourbon Whiskey",
      }),
    );
    expect(["pass", "warning"]).toContain(r.status);
  });

  it("FAIL when class is totally different beverage", () => {
    const r = statusOf("classType", APP, clean({ classType: "India Pale Ale" }));
    expect(r.status).toBe("fail");
  });
});

describe("compareFields — country of origin", () => {
  it("PASS on exact match", () => {
    const r = statusOf(
      "originCountry",
      { ...APP, originCountry: "France" },
      clean({ originCountry: "France" }),
    );
    expect(r.status).toBe("pass");
  });
  it("not included when application omits country", () => {
    const results = compareFields(APP, clean({ originCountry: "France" }));
    expect(results.find((r) => r.field === "originCountry")).toBeUndefined();
  });
  it("MISSING when application has country but label does not", () => {
    const r = statusOf(
      "originCountry",
      { ...APP, originCountry: "France" },
      clean({ originCountry: null }),
    );
    expect(r.status).toBe("missing");
  });
});

describe("compareFields — Government Warning near-miss handling", () => {
  it("PASS on whitespace-only OCR variance (whitespace gets collapsed)", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({
        governmentWarning:
          "GOVERNMENT WARNING: (1) According  to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
      }),
    );
    // Whitespace gets normalised in the comparator, so this is an exact pass.
    expect(r.status).toBe("pass");
  });

  it("REVIEW when text differs by a single character (>=98% similar)", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({
        governmentWarning:
          "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defect. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
      }),
    );
    expect(r.status).toBe("warning");
  });

  it("FAIL when one of the two clauses is missing", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({
        governmentWarning:
          "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.",
      }),
    );
    expect(r.status).toBe("fail");
  });
});

describe("compareFields — ABV exemption corner cases", () => {
  it("wine at exactly 14% requires ABV", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "wine",
        alcoholContent: "14% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        alcoholContent: null,
        beverageClass: "wine",
        classType: "Red Wine",
      }),
    );
    expect(r.status).toBe("missing");
  });

  it("wine at 13.9% can omit ABV", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "wine",
        alcoholContent: "13.9% Alc./Vol.",
        classType: "Red Wine",
      },
      clean({
        alcoholContent: null,
        beverageClass: "wine",
        classType: "Red Wine",
      }),
    );
    expect(r.status).toBe("n/a");
  });

  it("falls back to extracted beverage class when application says 'unknown'", () => {
    const r = statusOf(
      "alcoholContent",
      {
        ...APP,
        beverageClass: "unknown",
        alcoholContent: "5% Alc./Vol.",
        classType: "IPA",
      },
      clean({
        alcoholContent: null,
        beverageClass: "beer",
        classType: "IPA",
      }),
    );
    expect(r.status).toBe("n/a");
  });
});
