import { describe, expect, it } from "vitest";
import {
  caretAllowsCompletion,
  cleanEdit,
  completionPlan,
  editAsMarkdown,
  lineTail,
  lineToContinue,
  localLineCompletion,
  looksLikeMarkdown,
  prepareGhost,
} from "./text";

describe("looksLikeMarkdown", () => {
  it("recognizes structure that should render on paste", () => {
    expect(looksLikeMarkdown("# Title\n\nhello")).toBe(true);
    expect(looksLikeMarkdown("```\ncode\n```")).toBe(true);
    expect(looksLikeMarkdown("$$x^2$$")).toBe(true);
    expect(looksLikeMarkdown("energy $E = mc^2$ today")).toBe(true);
    expect(looksLikeMarkdown("- one\n- two")).toBe(true);
  });

  it("leaves ordinary sentences as plain text", () => {
    expect(looksLikeMarkdown("just a sentence about notes")).toBe(false);
    expect(looksLikeMarkdown("price is $5 today")).toBe(false);
  });
});

describe("cleanEdit", () => {
  it("keeps the replacement and drops the model's wrapper", () => {
    expect(cleanEdit('<think>hmm</think>\n"The cat sits."')).toBe("The cat sits.");
    expect(cleanEdit("```markdown\n- one\n- two\n```")).toBe("- one\n- two");
    expect(cleanEdit("  just the sentence  ")).toBe("just the sentence");
  });

  it("parses a rewrite only when it has markdown structure", () => {
    expect(editAsMarkdown("The cat sits.")).toBe(false);
    expect(editAsMarkdown("- one\n- two")).toBe(true);
    expect(editAsMarkdown("first paragraph\n\nsecond")).toBe(true);
  });
});

describe("completion", () => {
  it("continues only the current non-empty line", () => {
    expect(lineToContinue("done\n\n")).toBeNull();
    expect(lineToContinue("done\ni dont ")).toBe("i dont ");
  });

  it("keeps the tail on a word boundary", () => {
    const tail = lineTail(`${"alpha ".repeat(30)}beta`);
    expect(Array.from(tail).length).toBeLessThanOrEqual(80);
    expect(tail.startsWith("alpha") || tail.startsWith("beta")).toBe(true);
  });

  it("solves a single arithmetic step locally", () => {
    expect(localLineCompletion("2 + 2 =")).toBe(" 4");
    expect(localLineCompletion("2 + 2 = ")).toBe("4");
  });

  it("does not complete mid-word", () => {
    expect(caretAllowsCompletion("i dont", "")).toBe(false);
    expect(caretAllowsCompletion("i dont ", "")).toBe(true);
    expect(
      completionPlan({
        before: "i dont",
        after: "",
        enabled: true,
        model: "demo",
        code: false,
      }),
    ).toBeNull();
  });

  it("drops an echoed line and an unfinished token", () => {
    expect(prepareGhost("i dont ", "i dont know", false)).toBe("know");
    expect(prepareGhost("hello ", "wor", true)).toBe("");
    expect(prepareGhost("hello ", "world today", true)).toBe("world");
  });
});
