export function lineToContinue(prefix: string): string | null {
  const last = prefix.split("\n").pop() ?? "";
  if (last.trim() === "") return null;
  return last;
}

export function lineTail(line: string, max = 80): string {
  const chars = Array.from(line);
  if (chars.length <= max) return line;
  const tail = chars.slice(chars.length - max).join("");
  const previous = chars[chars.length - max - 1] ?? "";
  const cutMidWord = previous !== "" && !/\s/.test(previous) && !/\s/.test(tail[0] ?? "");
  if (!cutMidWord) return tail;
  const space = tail.search(/\s/);
  if (space < 0) return tail;
  return tail.slice(space).trimStart();
}

export function caretAllowsCompletion(prefix: string, after: string): boolean {
  // A pause is enough to request a continuation, including an unfinished word.
  // Never place a suggestion in front of existing text or another inline node.
  return prefix.trim().length > 0 && /^[\t ]*$/.test(after);
}

const SIMPLE_MATH = /^(-?\d+)\s*([+\-*/])\s*(-?\d+)\s*=\s*$/;

export function localLineCompletion(prefix: string): string | null {
  const last = prefix.split("\n").pop() ?? "";
  const match = last.match(SIMPLE_MATH);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[3]);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  let value: number;
  switch (match[2]) {
    case "+":
      value = left + right;
      break;
    case "-":
      value = left - right;
      break;
    case "*":
      value = left * right;
      break;
    case "/":
      if (right === 0) return null;
      value = left / right;
      break;
    default:
      return null;
  }
  if (!Number.isFinite(value)) return null;
  const rendered = Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  return /\s$/.test(last) ? rendered : ` ${rendered}`;
}

export function cleanEdit(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.trim();
  const fence = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fence?.[1]) text = fence[1].trim();
  const wrapped =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("“") && text.endsWith("”")) ||
    (text.startsWith("«") && text.endsWith("»"));
  if (wrapped && text.length > 1) text = text.slice(1, -1).trim();
  return text;
}

export function editAsMarkdown(text: string): boolean {
  return text.includes("\n\n") || looksLikeMarkdown(text);
}

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^#{1,6}\s+\S/m.test(trimmed)) return true;
  if (/^```/m.test(trimmed)) return true;
  if (/^\$\$[\s\S]+?\$\$/m.test(trimmed)) return true;
  if (/(^|[^$])\$[^$\n]+\$/.test(trimmed)) return true;
  if (/^\s*[-*+]\s+\S/m.test(trimmed)) return true;
  if (/^\s*\d+\.\s+\S/m.test(trimmed)) return true;
  if (/!\[[^\]]*]\([^)]+\)/.test(trimmed)) return true;
  if (/\[[^\]]+]\([^)]+\)/.test(trimmed)) return true;
  if (/^>\s+\S/m.test(trimmed)) return true;
  if (/(\*\*|__).+?\1/.test(trimmed)) return true;
  if (/^\|.+\|\s*$/m.test(trimmed)) return true;
  return false;
}

export function prepareGhost(prefixLine: string, raw: string, truncated: boolean): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "");
  const lineBreak = text.indexOf("\n");
  if (lineBreak >= 0) text = text.slice(0, lineBreak);
  if (prefixLine && text.startsWith(prefixLine)) text = text.slice(prefixLine.length);
  if (/\s$/.test(prefixLine)) text = text.replace(/^\s+/, "");
  if (text.trim() !== "" && text.trim() === prefixLine.trim()) return "";
  if (truncated && text && !/[\s.!?…,;:)]$/.test(text)) {
    const cut = text.trimEnd();
    const lastSpace = cut.lastIndexOf(" ");
    text = lastSpace > 0 ? cut.slice(0, lastSpace) : "";
  }
  return text;
}

export type CompletionPlan =
  | { kind: "local"; text: string }
  | { kind: "model"; prompt: string; prefixLine: string }
  | null;

export function completionPlan(options: {
  before: string;
  after: string;
  enabled: boolean;
  model: string;
  code: boolean;
}): CompletionPlan {
  if (!options.enabled || options.code) return null;
  if (!caretAllowsCompletion(options.before, options.after)) return null;
  const line = lineToContinue(options.before);
  if (!line) return null;
  const local = localLineCompletion(options.before);
  if (local) return { kind: "local", text: local };
  if (!options.model.trim() || line.trim().length < 4) return null;
  const prompt = lineTail(line);
  if (!prompt.trim()) return null;
  return { kind: "model", prompt, prefixLine: line };
}
