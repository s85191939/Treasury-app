import type {
  BeverageClass,
  ExtractedLabel,
  FieldResult,
  FieldStatus,
  LabelApplication,
} from "./types";

export const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9%./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1).fill(0);
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

export function parsePercent(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  const m2 = s.match(/(\d+(?:\.\d+)?)\s*proof/i);
  if (m2) return parseFloat(m2[1]) / 2;
  const m3 = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (m3) return parseFloat(m3[1]);
  return null;
}

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  cl: 10,
  floz: 29.5735,
  "fluidounce": 29.5735,
  "fluidounces": 29.5735,
  oz: 29.5735,
};

export function parseVolumeMl(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.toLowerCase().replace(/[,]/g, "").trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(ml|cl|liters?|litres?|l|fl\.?\s*oz\.?|fluid ounces?|oz)/);
  if (!m) {
    const just = cleaned.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    return just ? parseFloat(just[1]) : null;
  }
  const value = parseFloat(m[1]);
  const unitRaw = m[2];
  const unit = unitRaw.replace(/\s+/g, "").replace(/\./g, "");
  const factor = VOLUME_TO_ML[unit] ?? null;
  if (factor === null) return null;
  return value * factor;
}

function compareText(
  expected: string,
  found: string | null,
  warnThreshold = 0.85,
): { status: FieldStatus; note?: string } {
  if (!found) return { status: "missing", note: "Not detected on label" };
  const sim = similarity(expected, found);
  if (sim === 1) return { status: "pass" };
  if (sim >= warnThreshold) {
    return {
      status: "warning",
      note: `Close match (${Math.round(sim * 100)}%) — formatting differs`,
    };
  }
  return { status: "fail", note: `Mismatch (${Math.round(sim * 100)}% similar)` };
}

// ABV exemption rules per beverage type
// - Distilled spirits: ABV always required
// - Wine: ABV required if ≥ 14% ABV; otherwise the "Light Wine" / class designation
//   may stand in. We treat missing ABV as PASS for wine when expected is < 14%.
// - Beer / malt: ABV is optional at federal level (states vary). Missing is N/A.
function abvIsRequired(
  beverageClass: BeverageClass,
  expectedAbv: number | null,
): boolean {
  switch (beverageClass) {
    case "spirits":
      return true;
    case "wine":
      return expectedAbv === null ? true : expectedAbv >= 14;
    case "beer":
      return false;
    default:
      return true;
  }
}

function compareAbv(
  expected: string,
  found: string | null,
  beverageClass: BeverageClass,
): FieldResult {
  const exp = parsePercent(expected);
  const got = parsePercent(found);
  const required = abvIsRequired(beverageClass, exp);

  if (exp === null) {
    return {
      field: "alcoholContent",
      label: "Alcohol Content",
      expected,
      found,
      status: "warning",
      note: "Could not parse expected ABV",
    };
  }
  if (got === null) {
    if (!required) {
      return {
        field: "alcoholContent",
        label: "Alcohol Content",
        expected,
        found,
        status: "n/a",
        note:
          beverageClass === "wine"
            ? "Wine under 14% — ABV not required if class designation suffices"
            : "ABV is not required on this beverage type",
      };
    }
    return {
      field: "alcoholContent",
      label: "Alcohol Content",
      expected,
      found,
      status: "missing",
      note: "ABV not detected on label",
    };
  }
  const diff = Math.abs(exp - got);
  let status: FieldStatus = "fail";
  let note: string | undefined;
  if (diff < 0.05) status = "pass";
  else if (diff <= 0.3) {
    status = "warning";
    note = `ABV differs by ${diff.toFixed(2)}% (within typical tolerance)`;
  } else note = `ABV differs by ${diff.toFixed(2)}%`;
  return {
    field: "alcoholContent",
    label: "Alcohol Content",
    expected,
    found,
    status,
    note,
  };
}

// TTB Standards of Fill (27 CFR 5.203 for spirits, 27 CFR 4.72 for wine).
// Values in millilitres. Beer/malt is not regulated for fill at the federal
// level (state laws vary).
const STANDARD_FILLS_ML: Record<BeverageClass, number[] | null> = {
  spirits: [
    50, 100, 187, 200, 355, 375, 500, 700, 720, 750, 900, 1000, 1750,
  ],
  wine: [50, 100, 187, 200, 250, 355, 375, 500, 750, 1000, 1500, 3000, 4000],
  beer: null,
  unknown: null,
};

function isStandardFill(ml: number, beverageClass: BeverageClass): boolean {
  const list = STANDARD_FILLS_ML[beverageClass];
  if (!list) return true; // not regulated, so don't flag
  return list.some((v) => Math.abs(v - ml) < 1);
}

function checkStandardsOfFill(
  application: LabelApplication,
  beverageClass: BeverageClass,
): FieldResult | null {
  const allowedList = STANDARD_FILLS_ML[beverageClass];
  if (!allowedList) return null; // not regulated; skip the row entirely
  const ml = parseVolumeMl(application.netContents);
  if (ml === null) return null; // can't parse, the net-contents check already noted that
  if (isStandardFill(ml, beverageClass)) {
    return {
      field: "standardsOfFill",
      label: "Standards of Fill",
      expected: `${allowedList.map((v) => v).join(", ")} mL`,
      found: application.netContents,
      status: "pass",
    };
  }
  return {
    field: "standardsOfFill",
    label: "Standards of Fill",
    expected: `Approved sizes for ${beverageClass}`,
    found: application.netContents,
    status: "fail",
    note: `${application.netContents} is not a TTB-approved bottle size for ${beverageClass} (27 CFR 5.203 / 4.72)`,
  };
}

function compareNetContents(expected: string, found: string | null): FieldResult {
  const exp = parseVolumeMl(expected);
  const got = parseVolumeMl(found);
  if (exp === null) {
    return {
      field: "netContents",
      label: "Net Contents",
      expected,
      found,
      status: "warning",
      note: "Could not parse expected volume",
    };
  }
  if (got === null) {
    return {
      field: "netContents",
      label: "Net Contents",
      expected,
      found,
      status: "missing",
      note: "Volume not detected on label",
    };
  }
  const diff = Math.abs(exp - got);
  let status: FieldStatus = "fail";
  let note: string | undefined;
  if (diff < 0.5) status = "pass";
  else if (diff / exp < 0.02) {
    status = "warning";
    note = `Volume differs by ${diff.toFixed(1)} mL (within tolerance)`;
  } else note = `Volume differs by ${diff.toFixed(1)} mL`;
  return {
    field: "netContents",
    label: "Net Contents",
    expected,
    found,
    status,
    note,
  };
}

function compareWarning(
  found: string | null,
  modelClaimsCapsHeader: boolean,
  modelClaimsBoldHeader: boolean,
): FieldResult {
  if (!found) {
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found: null,
      status: "fail",
      note: "Required government warning statement is missing",
    };
  }
  const startsWithCaps = found.trimStart().startsWith("GOVERNMENT WARNING:");
  if (!startsWithCaps || !modelClaimsCapsHeader) {
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found,
      status: "fail",
      note: "Header is not 'GOVERNMENT WARNING:' in all caps — TTB requires exact format",
    };
  }
  if (!modelClaimsBoldHeader) {
    // Bold detection on real photographs is the noisiest model signal: small,
    // compressed warning text often reads as the same weight as the body even
    // when it is rendered bold. Surface as a *Review* so an agent eyeballs it,
    // rather than a hard fail that would generate false rejections.
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found,
      status: "warning",
      note: "Header may not be in bold weight — TTB requires bold 'GOVERNMENT WARNING:'. Please confirm visually before rejecting.",
    };
  }
  const normFound = found.replace(/\s+/g, " ").trim();
  const normCanon = CANONICAL_WARNING.replace(/\s+/g, " ").trim();
  if (normFound === normCanon) {
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found,
      status: "pass",
    };
  }
  const sim = similarity(normCanon, normFound);
  if (sim >= 0.98) {
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found,
      status: "warning",
      note: "Near-exact match — review for whitespace, punctuation, or OCR artifacts",
    };
  }
  return {
    field: "governmentWarning",
    label: "Government Warning",
    expected: CANONICAL_WARNING,
    found,
    status: "fail",
    note: `Warning text deviates from required wording (${Math.round(sim * 100)}% similar)`,
  };
}

function compareBeverageClass(
  expected: BeverageClass,
  found: BeverageClass,
): FieldResult | null {
  if (expected === "unknown") return null;
  const labels: Record<BeverageClass, string> = {
    spirits: "Distilled spirits",
    wine: "Wine",
    beer: "Beer / malt beverage",
    unknown: "Unspecified",
  };
  if (found === expected) {
    return {
      field: "beverageClass",
      label: "Beverage Type",
      expected: labels[expected],
      found: labels[found],
      status: "pass",
    };
  }
  if (found === "unknown") {
    return {
      field: "beverageClass",
      label: "Beverage Type",
      expected: labels[expected],
      found: labels[found],
      status: "warning",
      note: "Model could not confidently classify the beverage type",
    };
  }
  return {
    field: "beverageClass",
    label: "Beverage Type",
    expected: labels[expected],
    found: labels[found],
    status: "fail",
    note: `Label appears to be ${labels[found]}, not ${labels[expected]}`,
  };
}

export function compareFields(
  application: LabelApplication,
  extracted: ExtractedLabel,
): FieldResult[] {
  const results: FieldResult[] = [];

  const beverageCheck = compareBeverageClass(
    application.beverageClass,
    extracted.beverageClass,
  );
  if (beverageCheck) results.push(beverageCheck);

  results.push({
    field: "brandName",
    label: "Brand Name",
    expected: application.brandName,
    found: extracted.brandName,
    ...compareText(application.brandName, extracted.brandName),
  });

  results.push({
    field: "classType",
    label: "Class / Type",
    expected: application.classType,
    found: extracted.classType,
    ...compareText(application.classType, extracted.classType, 0.8),
  });

  results.push(
    compareAbv(
      application.alcoholContent,
      extracted.alcoholContent,
      application.beverageClass === "unknown"
        ? extracted.beverageClass
        : application.beverageClass,
    ),
  );

  results.push(compareNetContents(application.netContents, extracted.netContents));

  const effectiveClass: BeverageClass =
    application.beverageClass === "unknown"
      ? extracted.beverageClass
      : application.beverageClass;
  const standardsRow = checkStandardsOfFill(application, effectiveClass);
  if (standardsRow) results.push(standardsRow);

  results.push({
    field: "producer",
    label: "Producer / Bottler",
    expected: application.producer,
    found: extracted.producer,
    ...compareText(application.producer, extracted.producer, 0.8),
  });

  if (application.originCountry) {
    results.push({
      field: "originCountry",
      label: "Country of Origin",
      expected: application.originCountry,
      found: extracted.originCountry,
      ...compareText(application.originCountry, extracted.originCountry),
    });
  }

  results.push(
    compareWarning(
      extracted.governmentWarning,
      extracted.warningStartsWithCapsHeader,
      extracted.warningHeaderIsBold,
    ),
  );

  return results;
}

export function overallStatus(
  results: FieldResult[],
): "pass" | "fail" | "review" {
  if (results.some((r) => r.status === "fail" || r.status === "missing")) {
    return "fail";
  }
  if (results.some((r) => r.status === "warning")) return "review";
  return "pass";
}
