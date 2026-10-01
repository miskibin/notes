import { describe, expect, it } from "vitest";
import { countLines, newNoteName, retitle, titleFrom } from "./notes";

describe("notes", () => {
  it("counts logical lines consistently for Windows newlines and trailing newlines", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("one\n")).toBe(1);
    expect(countLines("one\r\n\r\ntwo\r\n")).toBe(3);
    expect(countLines("one\n\n")).toBe(2);
    expect(countLines("one\rtwo")).toBe(2);
  });
  it("uses the first heading as the title", () => {
    expect(titleFrom("## Pasted heading\n\nbody", "untitled.md")).toBe("Pasted heading");
    expect(titleFrom("no heading", "untitled.md")).toBe("untitled");
  });

  it("renames the first heading and keeps the rest of the note", () => {
    expect(retitle("# Welcome\n\nbody", "Start")).toBe("# Start\n\nbody");
    expect(retitle("no heading", "Start")).toBe("# Start\n\nno heading");
  });

  it("avoids colliding untitled names", () => {
    expect(newNoteName(["untitled.md", "untitled-2.md"])).toBe("untitled-3.md");
  });

  it("retitles the body while retaining the raw frontmatter", () => {
    const metadata = "---\n# Comment\ntags: [physics]\nnotes:\n  id: stable\n---\n";
    expect(retitle(`${metadata}Plain text`, "Heading")).toBe(`${metadata}# Heading\n\nPlain text`);
    expect(titleFrom(`${metadata}# Heading`, "a.md")).toBe("Heading");
    expect(countLines(`${metadata}Plain text\n`)).toBe(1);
  });
});
