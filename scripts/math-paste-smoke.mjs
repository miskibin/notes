import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const editor = page.locator('.ProseMirror[contenteditable="true"]');
const mode = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const screenshotDir = resolve(process.env.EDITOR_QA_DIR || "artifacts/math-paste-qa");
const sample = String.raw`\\[ B'=-33,\qquad A'=-55 \\]\\[ G'=-55-(-33)=\boxed{-22\ \mathrm{dB}} \\]`;
const fixture = "# Paste QA\n\n" + sample + "\n\n" + String.raw`Gain \(G=A-B\).` + "\n\n**After**.";
const paste = (locator, text) => locator.evaluate((el, value) => {
  const data = new DataTransfer();
  data.setData("text/plain", value);
  // Rich clipboard content must not override recognized plain-text math.
  data.setData("text/html", "<p>Wrong clipboard fallback</p>");
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}, text);

try {
  await page.goto(process.env.APP_URL || "http://localhost:1420");
  await editor.waitFor();
  await mode.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("# Before\n\nPrevious content.");
  assert.match(await source.innerText(), /Previous content/);
  await mode.click();
  assert.match(await editor.innerText(), /Previous content/);
  await editor.click();
  await page.keyboard.press("Control+a");
  await paste(editor, fixture);
  await page.locator("h1").click();
  assert.equal(await page.locator(".math-block .katex-display").count(), 2);
  assert.equal(await page.locator(".math-inline .katex").count(), 1);
  assert.equal(await page.locator(".math-invalid").count(), 0);
  assert.match(await editor.innerText(), /After/);
  assert.doesNotMatch(await editor.innerText(), /Wrong clipboard/);
  for (const selector of ["h1::before", "strong::before", ".math-fence"]) {
    const [element, pseudo] = selector.split("::");
    assert.equal(await page.locator(element).first().evaluate((el, p) => getComputedStyle(el, p ? `::${p}` : null).opacity, pseudo), "0.75");
  }
  await page.keyboard.press("Control+z");
  assert.match(await editor.innerText(), /Previous content/);
  assert.equal(await page.locator(".math-block").count(), 0);
  console.log("PASS: rich paste renders the user's two formulas and inline math, muted markers and one-step undo");

  await mode.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await paste(source, fixture);
  const converted = await source.innerText();
  assert.equal((converted.match(/\$\$/g) || []).length, 4);
  assert.match(converted, /\$G=A-B\$/);
  assert.doesNotMatch(converted, /\\\\\[/);
  assert.equal(await page.locator(".cm-markdown-syntax").first().evaluate((el) => getComputedStyle(el).opacity), "0.75");
  await page.keyboard.press("Control+z");
  assert.match(await source.innerText(), /Previous content/);
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await source.innerText(), converted);
  await mode.click();
  assert.equal(await page.locator(".math-block").count(), 2);
  assert.equal(await page.locator(".math-inline").count(), 1);
  console.log("PASS: source paste converts, undo/redo and switching modes preserve formulas");

  await mode.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("```latex\nliteral\n```");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await paste(source, sample);
  assert.match(await source.innerText(), /\\\\\[/);
  assert.doesNotMatch(await source.innerText(), /\$\$/);
  await mode.click();
  assert.equal(await page.locator(".math-block").count(), 0);
  assert.match(await page.locator("pre code").innerText(), /\\\\\[/);
  await page.locator("pre code").click();
  await paste(editor, String.raw`\(x^2\)`);
  assert.match(await page.locator("pre code").innerText(), /\\\(x\^2\\\)/);
  assert.equal(await page.locator(".math-inline").count(), 0);
  console.log("PASS: pasted code stays literal in both editors");

  await mode.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await paste(source, fixture);
  await mode.click();
  await page.locator("h1").click();
  // Closing inline math must leave the caret outside its source, so typing
  // ordinary text and another formula cannot corrupt the first formula.
  await editor.click();
  await page.keyboard.press("Control+a");
  await paste(editor, "# Inline QA\n\nBefore.");
  await editor.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("$C_1,C_2=40dbm$ = $ 40_1 dbfs $", { delay: 2 });
  assert.equal(await page.locator(".math-inline .katex").count(), 2);
  assert.equal(await page.locator(".math-inline.math-editing").count(), 0);
  assert.equal(await page.locator(".math-invalid").count(), 0);
  assert.deepEqual(await page.locator(".math-inline .math-source").allTextContents(), ["$C_1,C_2=40dbm$", "$ 40_1 dbfs $"]);
  await page.locator(".math-inline .math-rendered").nth(1).click();
  assert.equal(await page.locator(".math-inline.math-editing").count(), 1);
  await page.locator("h1").click();
  await page.waitForFunction(() => !document.querySelector(".math-inline.math-editing"));
  assert.equal(await page.locator(".math-inline.math-editing").count(), 0);
  console.log("PASS: two typed inline formulas render independently; click editing still works");
  assert.deepEqual(errors, []);
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, "converted-math.png") });
  console.log("PASS: no uncaught browser errors");
} catch (error) {
  console.error("Browser errors:", errors);
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, "failure.png") });
  throw error;
} finally {
  await browser.close();
}
