import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { history, undo } from "@milkdown/kit/prose/history";
import { describe, expect, it } from "vitest";
import { mathEditingPlugin, mathSource, mathSpec, mathValue } from "./math-document";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    math_inline: mathSpec(false),
    math_block: mathSpec(true),
    text: { group: "inline" },
  },
});
const block = (source: string) => schema.nodes.math_block.create(null, schema.text(source));
const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const stateFor = (source: string) => {
  const doc = schema.nodes.doc.create(null, [block(source), paragraph("after")]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, 4), plugins: [mathEditingPlugin(), history()] });
};

describe("editable math source", () => {
  it("keeps the actual delimiters and multiline LaTeX in the document", () => {
    const source = mathSource("\\frac{a}{b}\n+ c", true);
    const state = stateFor(source);
    expect(state.doc.firstChild?.isAtom).toBe(false);
    expect(state.doc.textBetween(1, 3)).toBe("$$");
    expect(mathValue(source, true)).toBe("\\frac{a}{b}\n+ c");
    expect(mathValue("$x^2$", false)).toBe("x^2");
    expect(mathValue("$$x^2$$", true)).toBe("x^2");
    expect(mathValue("$$x^2$", true)).toBeNull();
  });

  it("allows selection and deletion of just the opening fence, with undo", () => {
    let state = stateFor(mathSource("x^2", true));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 3)));
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("$$");
    state = state.applyTransaction(state.tr.deleteSelection()).state;
    expect(state.doc.firstChild?.textContent).toBe("\nx^2\n$$");
    expect(state.doc.firstChild?.type.name).toBe("math_block");
    expect(undo(state, (tr) => { state = state.applyTransaction(tr).state; })).toBe(true);
    expect(state.doc.firstChild?.textContent).toBe("$$\nx^2\n$$");
  });

  it("preserves damaged source as ordinary text after leaving the formula", () => {
    let state = stateFor(mathSource("x^2", true));
    state = state.applyTransaction(state.tr.delete(1, 3)).state;
    const after = state.doc.firstChild!.nodeSize + 1;
    state = state.applyTransaction(state.tr.setSelection(TextSelection.create(state.doc, after))).state;
    expect(state.doc.firstChild?.type.name).toBe("paragraph");
    expect(state.doc.firstChild?.textContent).toBe("\nx^2\n$$");
    expect(state.doc.lastChild?.textContent).toBe("after");
    state.doc.check();
  });

  it("supports a text selection spanning ordinary text and an inline formula", () => {
    const formula = schema.nodes.math_inline.create(null, schema.text("$E=mc^2$"));
    const p = schema.nodes.paragraph.create(null, [schema.text("before "), formula, schema.text(" after")]);
    const doc = schema.nodes.doc.create(null, p);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, p.nodeSize - 1), plugins: [mathEditingPlugin()] });
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("before $E=mc^2$ after");
    const deleted = state.applyTransaction(state.tr.deleteSelection()).state;
    expect(deleted.doc.textContent).toBe("");
    deleted.doc.check();
  });
});
