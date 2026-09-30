import { $inputRule, $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import katex from "katex";
import remarkMath from "remark-math";

const mathRemark = $remark("remarkMath", () => remarkMath);

const mathInlineSchema = $nodeSchema("math_inline", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    value: { default: "" },
  },
  parseDOM: [
    {
      tag: 'span[data-type="math-inline"]',
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.value ?? "",
      }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-type": "math-inline", "data-value": node.attrs.value as string },
  ],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? "") });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, String(node.attrs.value ?? ""));
    },
  },
}));

const mathBlockSchema = $nodeSchema("math_block", () => ({
  group: "block",
  atom: true,
  selectable: true,
  attrs: {
    value: { default: "" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="math-block"]',
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.value ?? "",
      }),
    },
  ],
  toDOM: (node) => ["div", { "data-type": "math-block", "data-value": node.attrs.value as string }],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? "") });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      state.addNode("math", undefined, String(node.attrs.value ?? ""));
    },
  },
}));

const mathInlineInput = $inputRule((ctx) => {
  return new InputRule(/\$(?!\$)([^$\n]+)\$$/, (state, match, start, end) => {
    const value = match[1]?.trim() ?? "";
    if (!value) return null;
    const before = start > 0 ? state.doc.textBetween(start - 1, start) : "";
    if (before === "$") return null;
    const node = mathInlineSchema.type(ctx).create({ value });
    return state.tr.replaceWith(start, end, node);
  });
});

const mathBlockInput = $inputRule((ctx) => {
  return new InputRule(/^\$\$\s$/, (state, _match, start) => {
    const $start = state.doc.resolve(start);
    if (!$start.parent.isTextblock) return null;
    if ($start.parent.textContent.trim() !== "$$") return null;
    const type = mathBlockSchema.type(ctx);
    const from = $start.before();
    let tr = state.tr.replaceWith(from, $start.after(), type.create({ value: "" }));
    tr = tr.setSelection(NodeSelection.create(tr.doc, from));
    return tr;
  });
});

function renderKatex(target: HTMLElement, value: string, display: boolean): void {
  target.replaceChildren();
  if (!value.trim()) {
    target.textContent = display ? "formula" : "ƒ";
    target.classList.add("math-empty");
    target.classList.remove("math-invalid");
    return;
  }
  try {
    katex.render(value, target, { throwOnError: true, displayMode: display });
    target.classList.remove("math-empty", "math-invalid");
  } catch {
    target.textContent = value;
    target.classList.add("math-invalid");
    target.classList.remove("math-empty");
  }
}

function createMathView(display: boolean) {
  return (node: ProseNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    let current = node;
    let editing = false;
    const dom = document.createElement(display ? "div" : "span");
    dom.className = display ? "math-block" : "math-inline";
    dom.dataset.type = display ? "math-block" : "math-inline";
    const rendered = document.createElement(display ? "div" : "span");
    rendered.className = "math-rendered";
    const field = document.createElement(display ? "textarea" : "input");
    field.className = "math-source";
    field.spellcheck = false;
    field.setAttribute("aria-label", "Formula source");
    if (field instanceof HTMLTextAreaElement) field.rows = 1;
    field.value = String(current.attrs.value ?? "");
    dom.append(rendered, field);

    const fit = () => {
      if (field instanceof HTMLTextAreaElement) {
        field.style.height = "0px";
        field.style.height = `${field.scrollHeight}px`;
        return;
      }
      field.style.width = `${Math.max(field.value.length, 1)}ch`;
    };

    const paint = () => {
      field.hidden = !editing;
      rendered.hidden = editing;
      if (editing) {
        field.value = String(current.attrs.value ?? "");
        fit();
        return;
      }
      renderKatex(rendered, String(current.attrs.value ?? ""), display);
    };

    const commit = () => {
      const pos = getPos();
      if (pos == null) return;
      const value = field.value;
      if (value === current.attrs.value) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, "value", value));
    };

    let composing = false;
    field.addEventListener("compositionstart", () => {
      composing = true;
    });
    field.addEventListener("compositionend", () => {
      composing = false;
      fit();
      commit();
    });
    field.addEventListener("input", () => {
      fit();
      if (!composing) commit();
    });
    field.addEventListener("blur", () => {
      commit();
      editing = false;
      paint();
    });
    field.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Escape" || (!display && key === "Enter")) {
        event.preventDefault();
        commit();
        const pos = getPos();
        field.blur();
        if (pos == null) return;
        const after = pos + current.nodeSize;
        const selection = TextSelection.near(view.state.doc.resolve(Math.min(after, view.state.doc.content.size)));
        view.dispatch(view.state.tr.setSelection(selection));
        view.focus();
      }
    });
    rendered.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    });

    paint();

    return {
      dom,
      ignoreMutation: () => true,
      stopEvent: (event) => editing && event.target === field,
      selectNode: () => {
        editing = true;
        paint();
        field.focus();
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          const end = field.value.length;
          field.setSelectionRange(end, end);
        }
      },
      deselectNode: () => {
        commit();
        editing = false;
        paint();
      },
      update: (next) => {
        if (next.type !== current.type) return false;
        current = next;
        if (document.activeElement !== field) {
          field.value = String(current.attrs.value ?? "");
          paint();
        }
        return true;
      },
    };
  };
}

const mathInlineView = $view(mathInlineSchema.node, () => createMathView(false));
const mathBlockView = $view(mathBlockSchema.node, () => createMathView(true));

export const mathPlugins = [
  mathRemark,
  mathInlineSchema,
  mathInlineInput,
  mathInlineView,
  mathBlockSchema,
  mathBlockInput,
  mathBlockView,
];
