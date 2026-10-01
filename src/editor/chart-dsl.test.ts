import { describe, expect, it } from "vitest";
import { compileChart, compileVegaLite, sanitizeSpec, writeParamValues } from "./chart-dsl";

const gain = `
type: line
x:
  from: 0
  to: 10
  step: 0.1
y: x * gain
params:
  gain:
    value: 2
    min: 0
    max: 5
    step: 0.1
`;

describe("chart dsl", () => {
  it("compiles a function of x into a Vega-Lite line with a slider", () => {
    const compiled = compileChart(gain);
    expect("error" in compiled).toBe(false);
    if ("error" in compiled) return;
    expect(compiled.spec.mark).toBe("line");
    expect(compiled.spec.transform).toEqual([{ calculate: "datum.x * gain", as: "y" }]);
    const params = compiled.spec.params as { name: string; value: number }[];
    expect(params[0]).toMatchObject({ name: "gain", value: 2 });
  });

  it("keeps an expression that already says datum.x", () => {
    const compiled = compileChart("type: function\nfunction: datum.x * 2\n");
    expect("error" in compiled).toBe(false);
    if ("error" in compiled) return;
    expect(compiled.spec.transform).toEqual([{ calculate: "datum.x * 2", as: "y" }]);
  });

  it("compiles inline rows", () => {
    const compiled = compileChart(`
type: bar
x: month
series:
  - y: revenue
    name: Revenue
data:
  - month: Jan
    revenue: 10
  - month: Feb
    revenue: 17
`);
    expect("error" in compiled).toBe(false);
    if ("error" in compiled) return;
    expect(compiled.spec.mark).toBe("bar");
    const data = compiled.spec.data as { values: { month: string }[] };
    expect(data.values.map((row) => row.month)).toEqual(["Jan", "Feb"]);
  });

  it("refuses a file path", () => {
    expect(compileChart("type: line\ndata: ../data/measurements.csv\n")).toEqual({
      error: "Put the rows in the note. Chart files are not loaded from a path.",
    });
  });

  it("strips remote data from a raw spec and can store a slider value", () => {
    const source = JSON.stringify({
      data: { url: "https://example.com/secret.json", values: [{ x: 1 }] },
      params: [{ name: "gain", value: 2 }],
      mark: "line",
    });
    const compiled = compileVegaLite(source);
    expect("error" in compiled).toBe(false);
    if ("error" in compiled) return;
    expect(compiled.spec.data).toEqual({ values: [{ x: 1 }] });
    expect(sanitizeSpec({ url: "https://example.com", encoding: { href: { value: "javascript:alert(1)" } } })).toEqual({ encoding: {} });
    const saved = writeParamValues("vega-lite", source, { gain: 3.7 });
    expect(JSON.parse(saved).params[0].value).toBe(3.7);
  });

  it("writes a chart slider back into the readable source", () => {
    const saved = writeParamValues("chart", gain, { gain: 3.7 });
    const compiled = compileChart(saved);
    expect("error" in compiled).toBe(false);
    if ("error" in compiled) return;
    expect((compiled.spec.params as { value: number }[])[0]?.value).toBe(3.7);
  });
  it("rejects unbounded or empty function sampling before rendering", () => {
    expect(compileChart("y: x\nx: {min: 0, max: 10, step: 0.00000001}")).toHaveProperty("error");
    expect(compileChart("y: x\nx: {min: 10, max: 0}")).toHaveProperty("error");
    expect(compileChart("y: x\nx: {min: -1.0e308, max: 1.0e308}")).toHaveProperty("error");
  });
});
