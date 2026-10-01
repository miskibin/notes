import { Schema } from "@milkdown/kit/prose/model";
import { expect, it } from "vitest";
import { editorTextRange } from "./reveal-text";

it("finds phrases that span formatted text nodes", () => {
  const schema = new Schema({ nodes: { doc: { content: "block+" }, paragraph: { group: "block", content: "text*" }, text: {} }, marks: { strong: {} } });
  const doc = schema.node("doc", null, schema.node("paragraph", null, [schema.text("Before bold "), schema.text("words", [schema.mark("strong")]), schema.text(" after")]));
  const range = editorTextRange(doc, "bold words");
  expect(range).not.toBeNull();
  expect(doc.textBetween(range!.from, range!.to)).toBe("bold words");
  expect(editorTextRange(doc, "absent")).toBeNull();
});
