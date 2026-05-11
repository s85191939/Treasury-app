export type BeverageClass = "spirits" | "wine" | "beer" | "unknown";

export interface LabelApplication {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producer: string;
  originCountry?: string;
  beverageClass?: BeverageClass;
}

export interface ExtractedLabel {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
  producer: string | null;
  originCountry: string | null;
  governmentWarning: string | null;
  warningStartsWithCapsHeader: boolean;
  notes: string | null;
}

export type FieldStatus = "pass" | "fail" | "warning" | "missing";

export interface FieldResult {
  field: string;
  label: string;
  expected: string | null;
  found: string | null;
  status: FieldStatus;
  note?: string;
}

export interface VerifyResponse {
  extracted: ExtractedLabel;
  results: FieldResult[];
  overall: "pass" | "fail" | "review";
  latencyMs: number;
}
