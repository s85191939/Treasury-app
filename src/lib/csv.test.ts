import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple csv with header row", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("returns an empty array when only a header is present", () => {
    expect(parseCsv("a,b,c\n")).toEqual([]);
  });

  it("returns an empty array on empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("handles trailing newline at EOF", () => {
    expect(parseCsv("a\n1\n")).toEqual([{ a: "1" }]);
    expect(parseCsv("a\n1")).toEqual([{ a: "1" }]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("respects quoted fields containing commas", () => {
    const rows = parseCsv('name,address\nFoo,"123 Main St, Bardstown, KY"\n');
    expect(rows[0]?.name).toBe("Foo");
    expect(rows[0]?.address).toBe("123 Main St, Bardstown, KY");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('brand\n"Stone\'s ""Throw"" Distillery"\n');
    expect(rows[0]?.brand).toBe('Stone\'s "Throw" Distillery');
  });

  it("preserves empty intermediate cells", () => {
    const rows = parseCsv("a,b,c\n1,,3\n");
    expect(rows[0]).toEqual({ a: "1", b: "", c: "3" });
  });

  it("trims surrounding whitespace from headers", () => {
    const rows = parseCsv("  a  , b\n1,2\n");
    expect(Object.keys(rows[0])).toContain("a");
    expect(Object.keys(rows[0])).toContain("b");
  });

  it("skips rows that are entirely empty", () => {
    const rows = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows.length).toBe(2);
  });

  it("handles quoted fields containing newlines", () => {
    const rows = parseCsv('a,b\n1,"line1\nline2"\n');
    expect(rows[0]?.b).toBe("line1\nline2");
  });
});
