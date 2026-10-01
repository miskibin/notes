import { $inputRule, $nodeSchema, $remark } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { TextSelection } from "@milkdown/kit/prose/state";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/ctx";
import { decodeString } from "micromark-util-decode-string";

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } } };

export function wikiTextNodes(value: string, raw: string): MarkdownNode[] {
  const children: MarkdownNode[] = [];
  let from = 0;
  for (const match of raw.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    let backslashes = 0;
    for (let i = match.index - 1; i >= 0 && raw[i] === "\\"; i--) backslashes++;
    if (backslashes % 2) continue;
    const start = decodeString(raw.slice(0, match.index)).length;
    const text = decodeString(match[0]);
    if (value.slice(start, start + text.length) !== text) continue;
    if (start > from) children.push({ type: "text", value: value.slice(from, start) });
    children.push({ type: "wikiLink", value: text });
    from = start + text.length;
  }
  if (!children.length) return [{ type: "text", value }];
  if (from < value.length) children.push({ type: "text", value: value.slice(from) });
  return children;
}

export function configureWikiSerialization(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, options => {
    const originalText = options.handlers?.text;
    return {
      ...options,
      unsafe: [...(options.unsafe ?? []), { character: "[", after: "\\[", inConstruct: "phrasing" as const }],
      handlers: {
        ...options.handlers,
        wikiLink: (node: { value?: unknown }) => String(node.value ?? ""),
        text: (...args: Parameters<NonNullable<typeof originalText>>) => {
          const [node, , state, info] = args;
          const value = "value" in node ? String(node.value) : "";
          // Milkdown's trailing-space shortcut bypasses escaping. Wiki literals
          // still need safe() so they do not become links on the next load.
          if (value.includes("[[") || !originalText) return state.safe(value, { ...info, encode: [] });
          return originalText(...args);
        },
      },
    };
  });
}

// Give wiki syntax its own inline node so CommonMark does not escape its
// brackets the next time the visual editor serializes the document.
const wikiRemark = $remark("wikiLinks", () => () => (tree: MarkdownNode, file: { value: unknown }) => {
  const source = String(file.value);
  const visit = (parent: MarkdownNode) => {
    parent.children = parent.children?.flatMap(node => {
      if (node.type !== "text" || !node.value) { visit(node); return [node]; }
      const raw = node.position ? source.slice(node.position.start.offset, node.position.end.offset) : node.value;
      return wikiTextNodes(node.value, raw);
    });
  };
  visit(tree);
});

const wikiSchema = $nodeSchema("wiki_link", () => ({
  inline: true, group: "inline", content: "text*",
  parseDOM: [{ tag: 'span[data-type="wiki-link"]' }],
  toDOM: () => ["span", { "data-type": "wiki-link", class: "note-wiki-link", title: "Ctrl+click to open the linked note" }, 0],
  parseMarkdown: { match: node => node.type === "wikiLink", runner: (state, node, type) => state.openNode(type).addText(String(node.value)).closeNode() },
  toMarkdown: { match: node => node.type.name === "wiki_link", runner: (state, node) => {
    const complete = /^\[\[[^\]\n]+\]\]$/.test(node.textContent);
    state.addNode(complete ? "wikiLink" : "text", undefined, node.textContent);
  } },
}));

const wikiInput = $inputRule(ctx => new InputRule(/\[\[([^\]\n]+)\]\]$/, (state, match, start, end) => {
  if (start > 0 && state.doc.textBetween(start - 1, start) === "\\") return null;
  const node = wikiSchema.type(ctx).create(null, state.schema.text(match[0]));
  const tr = state.tr.replaceWith(start, end, node);
  return tr.setSelection(TextSelection.create(tr.doc, start + node.nodeSize));
}));

export const wikiPlugins = [wikiRemark, wikiSchema, wikiInput];
