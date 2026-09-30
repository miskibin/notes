import { syntaxTree } from "@codemirror/language";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

function syntaxDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number }[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (/^(HeaderMark|EmphasisMark|CodeMark|LinkMark|QuoteMark|ListMark)$/.test(node.name)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  const text = view.state.doc.toString();
  for (const match of text.matchAll(/(?<!\\)\${1,2}/g)) {
    ranges.push({ from: match.index!, to: match.index! + match[0].length });
  }
  const mark = Decoration.mark({ class: "cm-markdown-syntax" });
  return Decoration.set(ranges.map(({ from, to }) => mark.range(from, to)), true);
}

export const sourceSyntax = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = syntaxDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.decorations = syntaxDecorations(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });
