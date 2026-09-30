import { Schema, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";
import {
  clipboardText,
  deleteLine,
  deleteTextLine,
  deleteWord,
  duplicateLine,
  insertLine,
  moveLine,
  moveTextLine,
  selectWord,
  wordTouching,
} from "./shortcuts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
    code_block: { group: "block", content: "text*", code: true },
    blockquote: { group: "block", content: "block+" },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*" },
  },
});

const p = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const doc = (...nodes: ProseNode[]) => schema.nodes.doc.create(null, nodes);

function at(node: ProseNode, text: string): EditorState {
  let pos = 1;
  node.descendants((child, offset) => {
    if (child.isText && child.text === text) pos = offset + 1;
  });
  return EditorState.create({ doc: node, selection: TextSelection.create(node, pos) });
}

function texts(node: ProseNode): string[] {
  const values: string[] = [];
  node.forEach((child) => values.push(child.textContent));
  return values;
}

describe("word and code lines", () => {
  it("finds the word touching the caret", () => {
    expect(wordTouching("kot spi", 1)).toEqual({ from: 0, to: 3 });
    expect(wordTouching("kot spi", 3)).toEqual({ from: 0, to: 3 });
    expect(wordTouching("kot spi", 4)).toEqual({ from: 4, to: 7 });
  });

  it("moves, duplicates, and deletes a line inside a code block", () => {
    expect(moveTextLine("alpha\nbeta\ngamma", 6, -1)).toEqual({ text: "beta\nalpha\ngamma", offset: 0 });
    expect(moveTextLine("alpha\nbeta\ngamma", 6, 1)?.text).toBe("alpha\ngamma\nbeta");
    expect(deleteTextLine("alpha\nbeta", 0)).toEqual({ text: "beta", offset: 0 });
  });
});

describe("block shortcuts", () => {
  it("moves a paragraph up and down", () => {
    const note = doc(p("alpha"), p("beta"), p("gamma"));
    const up = moveLine(at(note, "beta"), -1);
    expect(texts(up?.doc ?? note)).toEqual(["beta", "alpha", "gamma"]);
    const down = moveLine(at(note, "beta"), 1);
    expect(texts(down?.doc ?? note)).toEqual(["alpha", "gamma", "beta"]);
    expect(moveLine(at(note, "alpha"), -1)).toBeNull();
  });

  it("duplicates a paragraph below the caret", () => {
    const note = doc(p("alpha"), p("beta"));
    const copy = duplicateLine(at(note, "alpha"), 1);
    expect(texts(copy?.doc ?? note)).toEqual(["alpha", "alpha", "beta"]);
  });

  it("moves a list item with its bullet", () => {
    const item = (text: string) => schema.nodes.list_item.create(null, p(text));
    const list = schema.nodes.bullet_list.create(null, [item("one"), item("two")]);
    const moved = moveLine(at(doc(list), "two"), -1);
    expect(moved?.doc.firstChild?.textContent).toBe("twoone");
  });

  it("deletes the current paragraph and keeps the note valid", () => {
    const note = doc(p("alpha"), p("beta"));
    const removed = deleteLine(at(note, "alpha"));
    expect(texts(removed?.doc ?? note)).toEqual(["beta"]);
    const only = deleteLine(at(doc(p("alpha")), "alpha"));
    expect(only?.doc.childCount).toBe(1);
    expect(only?.doc.firstChild?.textContent).toBe("");
  });

  it("inserts a blank paragraph below", () => {
    const note = doc(p("alpha"), p("beta"));
    const inserted = insertLine(at(note, "alpha"), 1);
    expect(texts(inserted?.doc ?? note)).toEqual(["alpha", "", "beta"]);
  });

  it("selects the word under the caret and copies that word", () => {
    const state = at(doc(p("kot spi")), "kot spi");
    const selected = selectWord(state);
    expect(selected?.doc.textBetween(selected.selection.from, selected.selection.to)).toBe("kot");
    expect(clipboardText(state)).toBe("kot");
  });

  it("deletes the word to the left of the caret", () => {
    const note = doc(p("kot spi"));
    let pos = 1;
    note.descendants((child, offset) => {
      if (child.isText) pos = offset + "kot ".length;
    });
    const state = EditorState.create({ doc: note, selection: TextSelection.create(note, pos) });
    const removed = deleteWord(state, -1);
    expect(removed?.doc.textContent).toBe("spi");
  });

  it("moves a line inside a code block without leaving the block", () => {
    const code = schema.nodes.code_block.create(null, schema.text("alpha\nbeta"));
    const note = doc(code);
    let pos = 1;
    note.descendants((child, offset) => {
      if (child.isText) pos = offset + "alpha\n".length;
    });
    const state = EditorState.create({ doc: note, selection: TextSelection.create(note, pos) });
    const moved = moveLine(state, -1);
    expect(moved?.doc.firstChild?.textContent).toBe("beta\nalpha");
    expect(moved?.doc.firstChild?.type.name).toBe("code_block");
  });
});
