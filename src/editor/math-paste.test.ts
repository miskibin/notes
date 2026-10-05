import { describe, expect, it } from "vitest";
import { isLiteralMarkdownSelection, normalizePastedMath } from "./math-paste";

describe("ChatGPT formula paste", () => {
  it.each(["\\", "\\\\"])("converts adjacent display formulas with %s delimiters", (slash) => {
    const first = String.raw`B'=-33,\qquad A'=-55`;
    const second = String.raw`G'=-55-(-33)=\boxed{-22\ \mathrm{dB}}`;
    const pasted = `${slash}[ ${first} ${slash}]${slash}[ ${second} ${slash}]`;
    expect(normalizePastedMath(pasted)).toBe(`$$\n${first}\n$$\n\n$$\n${second}\n$$`);
  });

  it.each(["\\", "\\\\"])("converts inline formulas with %s delimiters in prose", (slash) => {
    expect(normalizePastedMath(`Gain ${slash}( G=A-B ${slash}) in dB.`)).toBe("Gain $G=A-B$ in dB.");
  });

  it("gives display formulas their own paragraphs without merging surrounding text", () => {
    expect(normalizePastedMath(String.raw`Before \[x^2\] after.`)).toBe("Before \n\n$$\nx^2\n$$\n\n after.");
    expect(normalizePastedMath("Before\n\n\\[x\\]\n\nAfter")).toBe("Before\n\n$$\nx\n$$\n\nAfter");
    expect(normalizePastedMath(String.raw`\[x\]`, "Before ", " after")).toBe("\n\n$$\nx\n$$\n\n");
  });

  it("preserves multiline LaTeX and matrix row backslashes", () => {
    const value = String.raw`\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
+ \frac{a}{b}`;
    expect(normalizePastedMath(`\\[\n${value}\n\\]`)).toBe(`$$\n${value}\n$$`);
  });

  it("is idempotent and leaves dollar math unchanged", () => {
    const pasted = String.raw`\[x\]` + "\n\n" + String.raw`Inline \(y\).`;
    const converted = normalizePastedMath(pasted);
    expect(normalizePastedMath(converted)).toBe(converted);
    const existing = String.raw`$\text{\(x\)}$` + "\n\n" + String.raw`$$\text{\[y\]}$$`;
    expect(normalizePastedMath(existing)).toBe(existing);
  });

  it.each([
    String.raw`\[x`, String.raw`x\]`, String.raw`\[x\)`, String.raw`\[ \]`,
    String.raw`\[x\\]`, String.raw`\\[x\]`, String.raw`\\\[x\\\]`, "\\(x\n+y\\)",
  ])("preserves incomplete or unsupported input: %s", (pasted) => {
    expect(normalizePastedMath(pasted)).toBe(pasted);
  });

  it("does not swallow a later valid formula after an unmatched opener", () => {
    expect(normalizePastedMath(String.raw`\[incomplete then \[x\]`)).toBe("\\[incomplete then \n\n$$\nx\n$$");
  });

  it("preserves fenced, indented and inline code and link URLs", () => {
    const code = "```latex\n\\[x\\]\n```\n\n~~~\n\\(y\\)\n~~~\n\n    \\[z\\]\n\n`\\(a\\)` and ``\\[b\\]``\n\n[code](https://example.org/\\(x\\))";
    expect(normalizePastedMath(code + "\n\n\\(c\\)")).toBe(code + "\n\n$c$");
  });

  it("keeps ordinary text and its original line endings intact", () => {
    const plain = "# Title\r\n\r\n**bold**, C:\\Users\\notes, [brackets] (parentheses), $20.\r\n";
    expect(normalizePastedMath(plain)).toBe(plain);
  });
});

describe("source editor paste context", () => {
  it.each(["```latex\n\\[x\\]\n```", "`\\(x\\)`", "$x^2$", "$$\nx^2\n$$"])("detects literal selection inside %s", (document) => {
    const caret = document.indexOf("x");
    expect(isLiteralMarkdownSelection(document, caret, caret)).toBe(true);
    expect(isLiteralMarkdownSelection(document, 0, document.length)).toBe(false);
  });

  it("allows conversion in prose outside code and existing formulas", () => {
    const document = "`code`\n\nHello $x^2$ world";
    const caret = document.indexOf("world");
    expect(isLiteralMarkdownSelection(document, caret, caret)).toBe(false);
  });
});
