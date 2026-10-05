import { markdownLanguage } from "@codemirror/lang-markdown";

type Range = { from: number; to: number; math?: boolean };

function escaped(text: string, at: number): boolean {
  let slashes = 0;
  while (at > 0 && text[--at] === "\\") slashes++;
  return slashes % 2 === 1;
}

// Use the Markdown parser so fenced, indented and inline code stay literal.
function literalRanges(text: string): Range[] {
  const ranges: Range[] = [];
  markdownLanguage.parser.parse(text).iterate({
    enter(node) {
      if (/^(FencedCode|CodeBlock|InlineCode|URL|Autolink)$/.test(node.name)) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  // Existing dollar math is already in our syntax. In particular, never
  // rewrite \[ or \( used as literal LaTeX inside it.
  for (let at = 0; at < text.length; at++) {
    const code = ranges.find((range) => range.from <= at && at < range.to);
    if (code) { at = code.to - 1; continue; }
    if (text[at] !== "$" || escaped(text, at)) continue;
    const fence = text[at + 1] === "$" ? "$$" : "$";
    let end = at + fence.length;
    while ((end = text.indexOf(fence, end)) >= 0) {
      if (!escaped(text, end) && (fence === "$$" || text[end + 1] !== "$")) break;
      end += fence.length;
    }
    if (end < 0 || (fence === "$" && text.slice(at, end).includes("\n"))) continue;
    ranges.push({ from: at, to: end + fence.length, math: true });
    at = end + fence.length - 1;
  }
  return ranges.sort((a, b) => a.from - b.from);
}

export function isLiteralMarkdownSelection(text: string, from: number, to: number): boolean {
  return literalRanges(text).some((range) => from > range.from && to < range.to);
}

function blockPadding(text: string, before: boolean): string {
  if (!text || !text.trim()) return "";
  const edge = before ? text.match(/\n[ \t]*$/) : text.match(/^[ \t]*\r?\n/);
  const blank = before ? /\n[ \t]*\r?\n[ \t]*$/.test(text) : /^[ \t]*\r?\n[ \t]*\r?\n/.test(text);
  return blank ? "" : edge ? "\n" : "\n\n";
}

/** Convert ChatGPT's paired LaTeX delimiters at the paste boundary only. */
export function normalizePastedMath(text: string, before = "", after = ""): string {
  if (!text.includes("\\[") && !text.includes("\\(")) return text;
  const ranges = literalRanges(text);
  let result = "";
  let at = 0;
  while (at < text.length) {
    const literal = ranges.find((range) => range.from <= at && at < range.to);
    if (literal) {
      result += text.slice(at, literal.to);
      at = literal.to;
      continue;
    }
    // Some clipboard exports double just the delimiter backslashes.
    const opener = /^(\\{1,2})([[(])/.exec(text.slice(at));
    if (!opener || text[at - 1] === "\\") { result += text[at++]; continue; }
    const display = opener[2] === "[";
    const close = opener[1] + (display ? "]" : ")");
    const start = at + opener[0].length;
    let end = text.indexOf(close, start);
    while (end >= 0 && text[end - 1] === "\\") end = text.indexOf(close, end + close.length);
    const nested = text.indexOf(opener[0], start);
    const value = end < 0 ? "" : text.slice(start, end).trim();
    if (!value || (!display && /[\r\n]/.test(value)) ||
      (nested >= 0 && nested < end) || ranges.some((range) => !range.math && range.from < end && range.to > start)) {
      result += text[at++];
      continue;
    }
    const next = end + close.length;
    if (display) {
      result += blockPadding(before + result, true) + `$$\n${value}\n$$` + blockPadding(text.slice(next) + after, false);
    } else {
      result += `$${value}$`;
    }
    at = next;
  }
  return result;
}
