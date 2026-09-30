import { parse, stringify } from "yaml";

export type ChartLanguage = "chart" | "vega-lite";

export type CompiledChart = {
  spec: Record<string, unknown>;
};

const SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json";

export function chartLanguage(language: string): ChartLanguage | null {
  const name = language.trim().toLowerCase();
  if (name === "chart") return "chart";
  if (name === "vega-lite" || name === "vega") return "vega-lite";
  return null;
}

export function compileChartSource(language: string, source: string): CompiledChart | { error: string } {
  const kind = chartLanguage(language);
  if (!kind) return { error: "Not a chart." };
  if (!source.trim()) return { error: "Empty chart." };
  return kind === "chart" ? compileChart(source) : compileVegaLite(source);
}

export function compileChart(source: string): CompiledChart | { error: string } {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid chart." };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "A chart is a mapping of fields." };
  const record = doc as Record<string, unknown>;
  if (typeof record.data === "string") {
    return { error: "Put the rows in the note. Chart files are not loaded from a path." };
  }
  if (Array.isArray(record.data)) return dataChart(record, record.data);
  const expression = typeof record.function === "string" ? record.function : typeof record.y === "string" ? record.y : "";
  if (!expression.trim()) return { error: "Add data, or a y expression such as a * x + b." };
  return functionChart(record, expression);
}

export function compileVegaLite(source: string): CompiledChart | { error: string } {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Vega-Lite spec must be a JSON object." };
    return { spec: sanitizeSpec(parsed) as Record<string, unknown> };
  } catch {
    return { error: "Invalid JSON." };
  }
}

/** Drop remote loads. The note app feeds Vega only data that is already in the file. */
export function sanitizeSpec(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSpec(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "url") continue;
    next[key] = sanitizeSpec(child);
  }
  return next;
}

export function writeParamValues(language: string, source: string, values: Record<string, unknown>): string {
  const kind = chartLanguage(language);
  if (kind === "vega-lite") {
    const spec = JSON.parse(source) as { params?: { name?: string; value?: unknown }[] };
    if (Array.isArray(spec.params)) {
      for (const param of spec.params) {
        if (!param || typeof param.name !== "string" || !(param.name in values)) continue;
        param.value = values[param.name];
      }
    }
    return `${JSON.stringify(spec, null, 2)}\n`;
  }
  const doc = parse(source) as Record<string, unknown>;
  const params = doc.params;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    for (const [name, raw] of Object.entries(params as Record<string, unknown>)) {
      if (!(name in values)) continue;
      if (typeof raw === "number" || raw == null) {
        (params as Record<string, unknown>)[name] = values[name];
      } else if (typeof raw === "object") {
        (raw as Record<string, unknown>).value = values[name];
      }
    }
  }
  const text = stringify(doc).trimEnd();
  return text ? `${text}\n` : "";
}

export function paramNames(language: string, source: string): string[] {
  try {
    if (chartLanguage(language) === "vega-lite") {
      const spec = JSON.parse(source) as { params?: { name?: string }[] };
      return Array.isArray(spec.params) ? spec.params.flatMap((param) => (typeof param?.name === "string" ? [param.name] : [])) : [];
    }
    const doc = parse(source) as { params?: Record<string, unknown> };
    return doc?.params && typeof doc.params === "object" ? Object.keys(doc.params) : [];
  } catch {
    return [];
  }
}

function functionChart(record: Record<string, unknown>, expression: string): CompiledChart {
  const range = axisRange(record.x);
  return {
    spec: baseSpec({
      params: vegaParams(record.params),
      data: { sequence: { start: range.min, stop: range.max, step: range.step, as: "x" } },
      transform: [{ calculate: toVegaExpr(expression), as: "y" }],
      mark: markName(record.type, "line"),
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative", title: expression },
      },
    }),
  };
}

function dataChart(record: Record<string, unknown>, rows: unknown[]): CompiledChart | { error: string } {
  const data = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
  if (!data.length) return { error: "Data needs at least one row." };
  const xField = typeof record.x === "string" ? record.x : "x";
  const series = readSeries(record, xField);
  if (markName(record.type, "line") === "arc") {
    const yField = series[0]?.y ?? (typeof record.y === "string" ? record.y : "y");
    return {
      spec: baseSpec({
        params: vegaParams(record.params),
        data: { values: data },
        mark: "arc",
        encoding: {
          theta: { field: yField, type: "quantitative" },
          color: { field: xField, type: fieldType(data, xField) },
        },
      }),
    };
  }
  if (series.length > 1) {
    const values = data.flatMap((row) =>
      series.map((item) => ({
        [xField]: row[xField],
        series: item.name ?? item.y,
        y: row[item.y],
      })),
    );
    return {
      spec: baseSpec({
        params: vegaParams(record.params),
        data: { values },
        mark: markName(record.type, "line"),
        encoding: {
          x: { field: xField, type: fieldType(values, xField) },
          y: { field: "y", type: "quantitative" },
          color: { field: "series", type: "nominal" },
        },
      }),
    };
  }
  const yField = series[0]?.y ?? (typeof record.y === "string" ? record.y : "y");
  return {
    spec: baseSpec({
      params: vegaParams(record.params),
      data: { values: data },
      mark: markName(record.type, "line"),
      encoding: {
        x: { field: xField, type: fieldType(data, xField) },
        y: { field: yField, type: fieldType(data, yField) === "quantitative" ? "quantitative" : "nominal" },
      },
    }),
  };
}

function baseSpec(spec: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: SCHEMA,
    width: "container",
    height: 280,
    ...spec,
  };
}

function markName(type: unknown, fallback: string): string {
  switch (type) {
    case "bar":
      return "bar";
    case "scatter":
    case "point":
      return "point";
    case "area":
      return "area";
    case "pie":
      return "arc";
    case "function":
    case "line":
      return "line";
    default:
      return fallback;
  }
}

function readSeries(record: Record<string, unknown>, xField: string): { y: string; name?: string }[] {
  if (!Array.isArray(record.series)) {
    return typeof record.y === "string" ? [{ y: record.y }] : [];
  }
  return record.series.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const y = (item as { y?: unknown }).y;
    if (typeof y !== "string" || y === xField) return [];
    const name = (item as { name?: unknown }).name;
    return [{ y, name: typeof name === "string" ? name : undefined }];
  });
}

function axisRange(x: unknown): { min: number; max: number; step: number } {
  const fallback = { min: 0, max: 10, step: 0.1 };
  if (!x || typeof x !== "object" || Array.isArray(x)) return fallback;
  const record = x as Record<string, unknown>;
  const min = numberValue(record.min ?? record.from, fallback.min);
  const max = numberValue(record.max ?? record.to, fallback.max);
  const span = Math.abs(max - min) || 1;
  const step = numberValue(record.step, Math.min(0.1, span / 100));
  return { min, max, step: step > 0 ? step : fallback.step };
}

function vegaParams(params: unknown): Record<string, unknown>[] {
  if (!params || typeof params !== "object" || Array.isArray(params)) return [];
  return Object.entries(params as Record<string, unknown>).flatMap(([name, raw]) => {
    if (!/^[A-Za-z_][\w]*$/.test(name)) return [];
    const record = typeof raw === "number" ? { value: raw } : raw;
    if (!record || typeof record !== "object" || Array.isArray(record)) return [];
    const fields = record as Record<string, unknown>;
    const value = numberValue(fields.value, 0);
    const min = numberValue(fields.min, value - 5);
    const max = numberValue(fields.max, value + 5);
    const step = numberValue(fields.step, niceStep(min, max));
    return [
      {
        name,
        value,
        bind: {
          input: "range",
          min,
          max,
          step: step > 0 ? step : 0.1,
          name: typeof fields.name === "string" ? fields.name : name,
        },
      },
    ];
  });
}

function fieldType(rows: Record<string, unknown>[], field: string): "quantitative" | "nominal" {
  const values = rows.map((row) => row[field]).filter((value) => value != null && value !== "");
  if (values.length > 0 && values.every((value) => typeof value === "number")) return "quantitative";
  return "nominal";
}

function toVegaExpr(expression: string): string {
  return expression.replace(/(?<!datum\.)\bx\b/g, "datum.x");
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function niceStep(min: number, max: number): number {
  const span = Math.abs(max - min) || 1;
  const raw = span / 100;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / pow;
  const nice = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return nice * pow;
}
