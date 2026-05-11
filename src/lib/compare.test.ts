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

  it("FAILs when header is regular weight (not bold)", () => {
    const r = statusOf(
      "governmentWarning",
      APP,
      clean({ warningHeaderIsBold: false }),
    );
    expect(r.status).toBe("fail");
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
