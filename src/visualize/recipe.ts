export type ChartRecipe = { title: string; caption: string; kind: "illustrative" | "data"; code: string };
export const SELECTION_LIMIT = 12_000;

export function validateIdea(text: string): void {
  if (!text.trim()) throw new Error("Select some text to visualize an idea.");
  if (Array.from(text).length > SELECTION_LIMIT) throw new Error("Select a shorter idea (12,000 characters maximum).");
}

export function parseRecipe(raw: string): ChartRecipe {
  const trimmed = raw.trim().replace(/^```json\s*\n([\s\S]*)\n```$/, "$1");
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { throw new Error("The model returned invalid chart JSON. Try again or choose another edit model."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The model returned an invalid chart description.");
  const item = value as Record<string, unknown>;
  for (const [key, max] of [["title", 200], ["caption", 1600], ["code", 20_000]] as const) {
    if (typeof item[key] !== "string" || !item[key].trim() || item[key].length > max) throw new Error(`The chart ${key} is missing or too long. Try again.`);
  }
  if (item.kind !== "illustrative" && item.kind !== "data") throw new Error("The chart must identify whether it uses data or an illustrative example.");
  return { title: (item.title as string).trim(), caption: (item.caption as string).trim(), code: item.code as string, kind: item.kind };
}

export function chartMarkdown(recipe: ChartRecipe, asset: string): string {
  const label = recipe.title.replace(/[\[\]\\\r\n]/g, " ").trim();
  const caption = recipe.caption.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>]/g, "\\$&");
  return `![${label}](${asset})\n\n${recipe.kind === "illustrative" ? "Illustrative · " : ""}${caption}\n`;
}
