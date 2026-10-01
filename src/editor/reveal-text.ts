import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export function editorTextRange(doc: ProseNode, query: string): { from: number; to: number } | null {
  if (!query) return null;
  let text = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isBlock && text && !text.endsWith("\n")) { text += "\n"; positions.push(pos); }
    if (!node.isText) return;
    text += node.text;
    for (let index = 0; index < node.nodeSize; index++) positions.push(pos + index);
  });
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return at < 0 ? null : { from: positions[at], to: positions[at + query.length - 1] + 1 };
}
