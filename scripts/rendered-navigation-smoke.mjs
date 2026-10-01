import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await context.addInitScript(() => localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, autocomplete: false })));
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const rich = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const toggle = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const output = resolve(process.env.EDITOR_QA_DIR || "artifacts/rendered-navigation");
const chart = "```chart\ny: x^2\n```";
const math = "$$\nx^2\n$$";
const chartImage = `![Generated chart](data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="100"><path d="M10 90L60 60L110 70L210 10" fill="none" stroke="steelblue" stroke-width="3"/></svg>')})`;

async function load(markdown) {
  await toggle.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(markdown);
  await toggle.click();
  await rich.waitFor();
}

try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420");
  await rich.waitFor();
  for (const [markdown, selector] of [[math, ".math-block"], [chart, ".chart-block"], [chartImage, ".milkdown-image-block"]]) {
    await load(markdown);
    await page.locator(selector).waitFor();
    if (selector === ".chart-block") await page.locator(".chart-mount svg").waitFor();
    await rich.locator('.rendered-cursor-edge[data-side="before"]').click();
    await page.keyboard.type("Before element");
    assert.match(await rich.locator(":scope > p").first().innerText(), /Before element/);
    await rich.locator('.rendered-cursor-edge[data-side="after"]').click();
    await page.keyboard.type("After element");
    assert.match(await rich.locator(":scope > p").last().innerText(), /After element/);
    assert.equal(await page.locator(selector).count(), 1);
    await rich.locator(":scope > p").last().click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    await page.locator(`${selector}:is(.ProseMirror-selectednode, .selected)`).waitFor();
    if (selector === ".math-block") assert.equal(await page.locator(".math-block .math-source").isVisible(), false);
    await page.keyboard.press("Backspace");
    assert.equal(await page.locator(selector).count(), 0);
    await page.keyboard.press("Control+z");
    await page.locator(selector).waitFor();
    console.log(`PASS: ${selector} — cursor on both sides, typing, selection, deletion and undo`);
  }

  await load(`Before\n\n${chart}\n\nAfter`);
  await page.locator(".chart-mount svg").waitFor();
  await page.locator(".chart-mount svg").click({ position: { x: 60, y: 60 } });
  await page.locator(".chart-block.ProseMirror-selectednode").waitFor();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "selected-chart.png") });
  await page.keyboard.press("Delete");
  assert.equal(await page.locator(".chart-block").count(), 0);
  await page.keyboard.press("Control+z");
  await page.locator(".chart-mount svg").waitFor();
  await page.locator(".chart-block").hover();
  await page.locator(".chart-actions").getByRole("button", { name: "Source", exact: true }).click();
  const textarea = page.getByRole("textbox", { name: "Chart source", exact: true });
  await textarea.fill("y: x^3");
  await textarea.press("Backspace");
  assert.equal(await page.locator(".chart-block").count(), 1);
  await textarea.fill("y: x^3");
  await rich.locator("p").last().click();
  await page.locator(".chart-mount svg").waitFor();
  await toggle.click();
  assert.match(await source.innerText(), /```chart\ny: x\^3\n```/);
  await toggle.click();
  console.log("PASS: chart click selection, Delete, undo, source editing and Markdown round trip");

  await load("Before $a+b$ after");
  const inlineEdges = rich.locator(".inline-cursor-edge");
  await inlineEdges.first().click();
  await page.keyboard.type("L");
  await inlineEdges.last().click();
  await page.keyboard.type("R");
  await inlineEdges.first().click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  assert.equal(await page.locator(".math-inline").count(), 0);
  assert.match(await rich.innerText(), /Before LR after/);
  await page.keyboard.press("Control+z");
  await page.locator(".math-inline").waitFor();
  console.log("PASS: inline formula boundaries, typing, Shift+arrow selection, deletion and undo");

  await load(`${chart}\n\n${math}\n\n${chart}`);
  await page.locator(".chart-block").nth(1).waitFor();
  await rich.locator('.block-cursor-edge[data-side="before"]').nth(1).click();
  await page.keyboard.type("Between elements");
  assert.match(await rich.locator(":scope > p").filter({ hasText: "Between elements" }).innerText(), /Between elements/);
  assert.equal(await page.locator(".chart-block").count(), 2);
  assert.equal(await page.locator(".math-block").count(), 1);
  console.log("PASS: writing between adjacent rendered blocks");
  for (const language of ["chart", "vega-lite"]) {
    await load("Blank");
    await rich.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(`\`\`\`${language} `);
    await page.locator(".chart-block").waitFor();
    await page.getByRole("textbox", { name: "Chart source", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Chart source", exact: true }).evaluate(el => document.activeElement === el), true);
  }
  console.log("PASS: typed chart fences create a chart with focused source editing");
  await load("Blank");
  await rich.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("```test-lang ");
  await rich.locator('pre[data-language="test-lang"]').waitFor();
  await page.keyboard.type("plain code");
  assert.equal(await rich.locator('pre[data-language="test-lang"] code').textContent(), "plain code");
  console.log("PASS: ordinary code fences retain editable source");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(output, "adjacent-blocks.png") });
} catch (error) {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "failure.png") });
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
