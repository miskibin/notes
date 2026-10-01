import { Schema } from "@milkdown/kit/prose/model";
import { GapCursor } from "@milkdown/kit/prose/gapcursor";
import { history, undo } from "@milkdown/kit/prose/history";
import { EditorState, NodeSelection, TextSelection, type Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { describe, expect, it } from "vitest";
import { mathEditingPlugin, mathSource, mathSpec } from "./math-document";
import { boundarySelection, renderedNodeKeyDown } from "./rendered-nodes";

const schema = new Schema({ nodes: {
  doc: { content: "block+" },
  paragraph: { group: "block", content: "inline*" },
  math_inline: mathSpec(false),
  math_block: mathSpec(true),
  chart_block: { group: "block", content: "text*", atom: true, code: true },
  code_block: { group: "block", content: "text*", code: true },
  "image-block": { group: "block", atom: true, isolating: true },
  text: { group: "inline" },
} });
const p = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const formula = schema.nodes.math_block.create(null, schema.text(mathSource("x^2", true)));
const chart = schema.nodes.chart_block.create(null, schema.text("y: x^2"));
const chartImage = schema.nodes["image-block"].create();

function editor(doc: ReturnType<typeof p>, selection: Selection) {
  let state = EditorState.create({ doc, selection, plugins: [mathEditingPlugin(), history()] });
  const view = { editable: true, get state() { return state; }, dispatch(tr) { state = state.applyTransaction(tr).state; } } as EditorView;
  return { view, key: (key: string, shiftKey = false) => renderedNodeKeyDown(view, { key, shiftKey, target: null } as KeyboardEvent) };
}

describe("navigation around rendered elements", () => {
  for (const node of [formula, chart, chartImage]) {
    it(`selects, deletes and restores a ${node.type.name} from the following paragraph`, () => {
      const doc = schema.nodes.doc.create(null, [node, p("after")]);
      const test = editor(doc, TextSelection.create(doc, node.nodeSize + 1));
      expect(test.key("Backspace")).toBe(true);
      expect(test.view.state.selection).toBeInstanceOf(NodeSelection);
      expect(test.view.state.doc.firstChild).toEqual(node);
      expect(test.key("Backspace")).toBe(true);
      expect(test.view.state.doc.textContent).toBe("after");
      expect(undo(test.view.state, test.view.dispatch)).toBe(true);
      expect(test.view.state.doc.firstChild).toEqual(node);
      test.view.state.doc.check();
    });

    it(`provides writing positions on both sides of a standalone ${node.type.name}`, () => {
      const doc = schema.nodes.doc.create(null, [node]);
      for (const [pos, side] of [[0, -1], [node.nodeSize, 1]] as const) {
        const test = editor(doc, NodeSelection.create(doc, 0));
        const gap = boundarySelection(test.view.state, pos, side);
        expect(gap).toBeInstanceOf(GapCursor);
        test.view.dispatch(test.view.state.tr.setSelection(gap));
        expect(test.key("Enter")).toBe(true);
        test.view.dispatch(test.view.state.tr.insertText("outside"));
        expect(test.view.state.doc.child(side < 0 ? 0 : 1).textContent).toBe("outside");
        expect(test.view.state.doc.child(side < 0 ? 1 : 0)).toEqual(node);
        test.view.state.doc.check();
      }
    });

    it(`selects a ${node.type.name} from the preceding paragraph without exposing its source`, () => {
      const before = p("before");
      const doc = schema.nodes.doc.create(null, [before, node, p("after")]);
      const test = editor(doc, TextSelection.create(doc, before.nodeSize - 1));
      expect(test.key("ArrowDown", true)).toBe(true);
      expect(test.view.state.selection).toBeInstanceOf(NodeSelection);
      expect(test.view.state.selection.from).toBe(before.nodeSize);
      expect(test.key("ArrowRight")).toBe(true);
      expect(test.view.state.selection.$from.parent.textContent).toBe("after");
    });
  }

  it("moves across an inline formula and selects it with Shift+arrow", () => {
    const inline = schema.nodes.math_inline.create(null, schema.text("$a+b$"));
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [schema.text("a"), inline, schema.text("b")]));
    const test = editor(doc, TextSelection.create(doc, 2));
    expect(test.key("ArrowRight")).toBe(true);
    expect(test.view.state.selection.from).toBe(2 + inline.nodeSize);
    expect(test.key("ArrowLeft", true)).toBe(true);
    expect(test.view.state.selection.from).toBe(2);
    expect(test.view.state.selection.to).toBe(2 + inline.nodeSize);
    test.view.dispatch(test.view.state.tr.deleteSelection());
    expect(test.view.state.doc.textContent).toBe("ab");
  });

  it("leaves ordinary code and formula source navigation to the editor", () => {
    const code = schema.nodes.code_block.create(null, schema.text("const x = 1"));
    const doc = schema.nodes.doc.create(null, [code, formula]);
    const test = editor(doc, TextSelection.create(doc, 1));
    expect(test.key("ArrowRight")).toBe(false);
    test.view.dispatch(test.view.state.tr.setSelection(TextSelection.create(doc, code.nodeSize + 4)));
    expect(test.key("ArrowRight")).toBe(false);
  });
});
