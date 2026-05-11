import type {
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
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev[0], curr[0]] = [curr[0], prev[0]];
    for (let k = 0; k <= b.length; k++) prev[k] = curr[k];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

function parsePercent(s: string | null | undefined): number | null {
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
  "fl.oz.": 29.5735,
  "fl.oz": 29.5735,
  "fl oz": 29.5735,
  "fluid ounce": 29.5735,
  "fluid ounces": 29.5735,
  oz: 29.5735,
};

function parseVolumeMl(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.toLowerCase().replace(/[,]/g, "").trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(ml|cl|liters?|litres?|l|fl\.?\s*oz\.?|fluid ounces?|oz)/);
  if (!m) {
    const just = cleaned.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    return just ? parseFloat(just[1]) : null;
  }
  const value = parseFloat(m[1]);
  const unit = m[2].replace(/\s+/g, "").replace(/\./g, "");
  const factor = VOLUME_TO_ML[unit] ?? VOLUME_TO_ML[m[2].trim()] ?? null;
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

function compareAbv(expected: string, found: string | null): FieldResult {
  const exp = parsePercent(expected);
  const got = parsePercent(found);
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
    note = `Volume differs by ${diff.toFixed(1)} mL`;
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

function compareWarning(found: string | null, hasCapsHeader: boolean): FieldResult {
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
  if (!hasCapsHeader) {
    return {
      field: "governmentWarning",
      label: "Government Warning",
      expected: CANONICAL_WARNING,
      found,
      status: "fail",
      note: "Header is not in all caps as 'GOVERNMENT WARNING:' — TTB requires exact format",
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

export function compareFields(
  application: LabelApplication,
  extracted: ExtractedLabel,
): FieldResult[] {
  const results: FieldResult[] = [];

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

  results.push(compareAbv(application.alcoholContent, extracted.alcoholContent));

  results.push(compareNetContents(application.netContents, extracted.netContents));

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
    compareWarning(extracted.governmentWarning, extracted.warningStartsWithCapsHeader),
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
