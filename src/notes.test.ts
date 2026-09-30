import { describe, expect, it } from "vitest";
import { newNoteName, retitle, titleFrom } from "./notes";

describe("notes", () => {
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
});
