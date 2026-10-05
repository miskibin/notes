import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// An isolated browser vault keeps this smoke test away from desktop notes.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const editor = page.locator('.ProseMirror[contenteditable="true"]');
const mode = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const screenshotDir = resolve(process.env.EDITOR_QA_DIR || "artifacts/editor-qa");

try {
  await page.goto(process.env.APP_URL || "http://localhost:1420");
  await editor.waitFor();
  await page.locator(".math-block .katex-display").waitFor();
  await page.locator(".math-block .math-rendered").click();
  await page.locator(".math-block.math-editing .math-source").waitFor({ state: "visible" });
  assert.equal(await page.locator(".math-block .math-preview").isVisible(), false);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), "$$");
  await page.keyboard.press("Backspace");
  assert.equal((await page.locator(".math-block .math-source").textContent()).startsWith("$$"), false);
  await page.keyboard.press("Control+z");
  assert.equal((await page.locator(".math-block .math-source").textContent()).startsWith("$$"), true);
  await page.locator("h1").click();
  await page.locator(".math-block .katex-display").waitFor({ state: "visible" });
  console.log("PASS: real $$ selection, deletion, undo, and display preview");

  await mode.click();
  await source.waitFor();
  await source.click();
  await page.keyboard.press("Control+a");
  const fixture = "# Editor QA\n\nBefore $a+b$ after.\n\n$$\n\\frac{a}{b}\n$$\n\n[link](https://example.org)\n\n**bold**\n\n$$z^2$$\n\n```js\nconst a = 1;\n```\n";
  await page.keyboard.insertText(fixture);
  await mode.click(); // Switch immediately, before Milkdown's listener delay.
  await editor.waitFor();
  assert.equal(await page.locator(".math-block").count(), 2);
  assert.equal(await page.locator(".math-inline").count(), 1);
  assert.equal(await page.locator("pre code").textContent(), "const a = 1;");
  assert.equal(await page.locator("h1").evaluate((el) => getComputedStyle(el, "::before").content), '"# "');
  assert.equal(await page.locator(".math-block .math-fence").first().innerText(), "$$");
  assert.equal(await page.locator(".math-block .math-fence").first().evaluate((el) => getComputedStyle(el).color),
    await page.locator("h1").evaluate((el) => getComputedStyle(el, "::before").color));
  let popups = 0;
  page.on("popup", async (popup) => { popups++; await popup.close(); });
  await page.locator('a[href="https://example.org"]').click();
  assert.equal(popups, 0);
  await page.locator(".math-inline .math-rendered").click();
  await page.locator(".math-inline.math-editing .math-source").waitFor({ state: "visible" });
  await page.keyboard.press("Control+a");
  assert.match(await page.evaluate(() => window.getSelection()?.toString() || ""), /Before \$a\+b\$ after/);
  await page.keyboard.press("ArrowRight");
  console.log("PASS: inline math, one-line display math, cross-formula selection, plain-click links, code blocks");

  // Switching during active edits must read the editor's current document.
  await mode.click();
  await source.waitFor();
  await source.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\nImmediate edit");
  await mode.click();
  await editor.waitFor();
  assert.match(await editor.innerText(), /Immediate edit/);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" plus last keystroke");
  await mode.click();
  await source.waitFor();
  assert.match(await source.innerText(), /Immediate edit plus last keystroke/);
  await page.keyboard.press("Control+Shift+m");
  await editor.waitFor();
  console.log("PASS: source/preview synchronization and Ctrl+Shift+M");

  // Pasting multiple Markdown paragraphs must replace a selection, and pasting
  // into math must remain literal LaTeX rather than insert document blocks.
  await editor.click();
  await page.keyboard.press("Control+a");
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "# Replacement\n\nfirst\n\nsecond");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.match(await editor.innerText(), /Replacement/);
  assert.doesNotMatch(await editor.innerText(), /Immediate edit/);
  assert.equal(await page.locator(".math-block").count(), 0);
  console.log("PASS: multi-paragraph Markdown paste replaces the selection");

  await page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "New note", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".ProseMirror")?.textContent === "");
  await editor.click();
  await page.keyboard.type("$$ ");
  await page.locator(".math-block.math-editing").waitFor();
  assert.equal(await page.locator(".math-block .math-source").textContent(), "$$\n\n$$");
  await page.keyboard.type("x^2");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "\\text{$a$}");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.match(await page.locator(".math-block .math-source").textContent(), /\\text\{\$a\$\}/);
  assert.equal(await page.locator(".math-inline").count(), 0);
  await page.keyboard.press("Control+z");
  assert.equal(await page.locator(".math-block .math-source").textContent(), "$$\nx^2\n$$");
  console.log("PASS: pasted LaTeX stays literal inside a formula");
  await page.keyboard.press("Escape");
  await page.locator(".math-block .katex-display").waitFor({ state: "visible" });
  await page.keyboard.type("after formula");
  assert.match(await editor.innerText(), /after formula/);
  console.log("PASS: $$ creation, empty source, typing, Escape and text after formula");

  await mode.click();
  await source.waitFor();
  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("# Wzory\n\n$$\n{}^{432}a_2\n$$\n\nPoza wzorem.");
  await mode.click();
  await page.locator(".math-block .katex-display").waitFor({ state: "visible" });
  const formulaLayout = await page.locator(".math-block .math-rendered").evaluate((el) => ({
    overflow: getComputedStyle(el).overflowX,
    width: el.getBoundingClientRect().width,
    contentWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  assert.equal(formulaLayout.overflow, "visible");
  assert.ok(formulaLayout.width < 200, JSON.stringify(formulaLayout));
  assert.ok(formulaLayout.contentWidth <= formulaLayout.clientWidth + 2, JSON.stringify(formulaLayout));
  console.log("PASS: compact 432/a_2 formula has no horizontal scrollbar", formulaLayout);

  assert.deepEqual(errors, []);
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, "math-preview.png"), clip: { x: 0, y: 0, width: 1100, height: 300 } });
  await page.locator(".math-block .math-rendered").click();
  await page.locator(".math-block.math-editing .math-source").waitFor({ state: "visible" });
  assert.equal(await page.locator(".math-block .math-preview").isVisible(), false);
  await page.screenshot({ path: resolve(screenshotDir, "math-editing.png"), clip: { x: 0, y: 0, width: 1100, height: 300 } });
  console.log("PASS: no uncaught browser errors");
} catch (error) {
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, "failure.png") });
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
