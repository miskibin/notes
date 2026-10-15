import { describe, expect, it } from "vitest";
import { outlineHeadings } from "./NoteOutline";

describe("outlineHeadings", () => {
  it("lists H1–H3 outside code and math fences", () => {
    const md = "# Title\n\nText\n\n## **Bold** part ##\n```\n# not\n```\n$$\n# no\n$$\n$$x$$\n### Deep\n#### Skipped";
    expect(outlineHeadings(md).map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: "Title" }, { level: 2, text: "Bold part" }, { level: 3, text: "Deep" },
    ]);
    expect(outlineHeadings(md)[1].line).toBe("## **Bold** part ##");
  });
});
