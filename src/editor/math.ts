import { $inputRule, $nodeSchema, $prose, $remark, $view } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import katex from "katex";
import remarkMath from "remark-math";
import { mathEditingPlugin, mathSelectionTouches, mathSource, mathSpec, mathValue } from "./math-document";

const mathRemark = $remark("remarkMath", () => remarkMath);

// A standalone one-line $$…$$ uses the same display view as a fenced block.
type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
const displayMathRemark = $remark("displayMath", () => () => (tree: MarkdownNode, file: { value: unknown }) => {
  const source = String(file.value);
  const visit = (parent: MarkdownNode) => {
    parent.children?.forEach((node, index) => {
      const child = node.type === "paragraph" && node.children?.length === 1 ? node.children[0] : null;
      if (child?.type === "inlineMath" && child.position) {
        const raw = source.slice(child.position.start.offset, child.position.end.offset);
        if (raw.startsWith("$$") && raw.endsWith("$$")) {
          parent.children![index] = { type: "math", value: child.value, position: node.position };
          return;
        }
      }
      visit(node);
    });
  };
  visit(tree);
});

const mathInlineSchema = $nodeSchema("math_inline", () => ({
  ...mathSpec(false),
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.openNode(type).addText(mathSource(String(node.value ?? ""), false)).closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      const value = mathValue(node.textContent, false);
      state.addNode(value == null ? "text" : "inlineMath", undefined, value ?? node.textContent);
    },
  },
}));

const mathBlockSchema = $nodeSchema("math_block", () => ({
  ...mathSpec(true),
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.openNode(type).addText(mathSource(String(node.value ?? ""), true)).closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      const value = mathValue(node.textContent, true);
      if (value != null) state.addNode("math", undefined, value);
      else state.openNode("paragraph").addNode("text", undefined, node.textContent).closeNode();
    },
  },
}));

const mathInlineInput = $inputRule((ctx) => new InputRule(/\$(?!\$)([^$\n]+)\$$/, (state, match, start, end) => {
  const value = match[1] ?? "";
  if (!value.trim() || (start > 0 && /[$\\]/.test(state.doc.textBetween(start - 1, start)))) return null;
  const node = mathInlineSchema.type(ctx).create(null, state.schema.text(mathSource(value, false)));
  const tr = state.tr.replaceWith(start, end, node);
  // Completing the closing fence means the next character belongs to prose.
  // Keeping the caret inside would append a second formula to this one's source.
  return tr.setSelection(TextSelection.create(tr.doc, start + node.nodeSize));
}));

const mathBlockInput = $inputRule((ctx) => new InputRule(/^\$\$\s$/, (state, _match, start) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.type.name !== "paragraph" || $start.parent.textContent.trim() !== "$$") return null;
  const from = $start.before();
  const node = mathBlockSchema.type(ctx).create(null, state.schema.text(mathSource("", true)));
  const tr = state.tr.replaceWith(from, $start.after(), node);
  return tr.setSelection(TextSelection.create(tr.doc, from + 4));
}));

const completeMathBlockInput = $inputRule((ctx) => new InputRule(/^\$\$([^\n]+)\$\$$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  // Replacing the paragraph is safe only if the entire paragraph is the formula.
  if ($start.parent.type.name !== "paragraph" || end !== $start.end()) return null;
  const from = $start.before();
  const node = mathBlockSchema.type(ctx).create(null, state.schema.text(mathSource(match[1] ?? "", true)));
  const tr = state.tr.replaceWith(from, $start.after(), node);
  const after = from + node.nodeSize;
  tr.insert(after, state.schema.nodes.paragraph!.create());
  return tr.setSelection(TextSelection.create(tr.doc, after + 1));
}));

function createMathView(display: boolean) {
  return (node: ProseNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    let current = node;
    let paintedSource: string | undefined;
    const dom = document.createElement(display ? "div" : "span");
    dom.className = display ? "math-block" : "math-inline";
    dom.dataset.type = display ? "math-block" : "math-inline";
    const rendered = document.createElement(display ? "div" : "span");
    rendered.className = "math-rendered";
    rendered.contentEditable = "false";
    rendered.title = "Click to edit formula";
    const source = document.createElement(display ? "div" : "span");
    source.className = "math-source";
    const opening = document.createElement("span");
    opening.className = "math-fence markdown-syntax";
    opening.contentEditable = "false";
    opening.textContent = display ? "$$" : "$";
    const closing = opening.cloneNode(true) as HTMLSpanElement;
    const preview = document.createElement(display ? "div" : "span");
    preview.className = "math-preview";
    preview.contentEditable = "false";
    preview.append(opening, rendered, closing);
    dom.append(preview, source);

    const paint = () => {
      paintedSource = current.textContent;
      const value = mathValue(current.textContent, display);
      rendered.replaceChildren();
      dom.classList.remove("math-invalid");
      dom.removeAttribute("title");
      if (value == null || !value.trim()) {
        rendered.textContent = current.textContent;
        return;
      }
      try {
        katex.render(value, rendered, { throwOnError: true, displayMode: display });
      } catch {
        rendered.textContent = current.textContent;
        dom.classList.add("math-invalid");
        dom.title = "Invalid LaTeX — click to edit";
      }
    };

    rendered.addEventListener("mousedown", (event) => {
      if (!view.editable) return;
      const mouse = event as MouseEvent;
      if (mouse.button !== 0 || mouse.shiftKey) return;
      event.preventDefault();
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + (display ? 4 : 2))));
      view.focus();
    });
    const editFence = (element: HTMLElement, atEnd: boolean) => {
      element.addEventListener("mousedown", (event) => {
        if (!view.editable) return;
        if (event.button !== 0) return;
        event.preventDefault();
        const pos = getPos();
        if (pos == null) return;
        const fence = display ? 2 : 1;
        const from = pos + 1 + (atEnd ? current.content.size - fence : 0);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + fence)));
        view.focus();
      });
    };
    editFence(opening, false);
    editFence(closing, true);
    paint();

    return {
      dom,
      contentDOM: source,
      ignoreMutation: (mutation) => mutation.type !== "selection" && preview.contains(mutation.target),
      update: (next) => {
        if (next.type !== current.type) return false;
        current = next;
        const pos = getPos();
        // KaTeX is synchronous. Repaint when source editing ends, rather than
        // rendering a hidden preview on every keystroke of a long formula.
        if (paintedSource !== current.textContent && (pos == null || !mathSelectionTouches(view.state, pos, current))) paint();
        return true;
      },
    };
  };
}

const mathInlineView = $view(mathInlineSchema.node, () => createMathView(false));
const mathBlockView = $view(mathBlockSchema.node, () => createMathView(true));
const mathEditing = $prose(() => mathEditingPlugin());

export const mathPlugins = [
  mathRemark, displayMathRemark,
  mathInlineSchema, mathInlineInput, mathInlineView,
  mathBlockSchema, mathBlockInput, completeMathBlockInput, mathBlockView,
  mathEditing,
];
