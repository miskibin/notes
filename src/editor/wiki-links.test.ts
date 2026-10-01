import { describe, expect, it } from "vitest";
import { wikiTextNodes } from "./wiki-links";

describe("wiki text parsing", () => {
  it("keeps escaped literals beside real links, including repeated titles", () => {
    expect(wikiTextNodes("[[Beta]] and [[Beta]]", "\\[\\[Beta]] and [[Beta]]")).toEqual([
      { type: "text", value: "[[Beta]] and " }, { type: "wikiLink", value: "[[Beta]]" },
    ]);
  });

  it("maps Markdown escapes and entities before links to their decoded positions", () => {
    expect(wikiTextNodes("A & * [[Target]] tail", "A &amp; \\* [[Target]] tail")).toEqual([
      { type: "text", value: "A & * " }, { type: "wikiLink", value: "[[Target]]" },
      { type: "text", value: " tail" },
    ]);
  });
});
