import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Capture the real application frontend using its isolated browser vault.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1600 }, locale: "pl-PL", timezoneId: "Europe/Warsaw",
});
await context.addInitScript(() => {
  localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, colorMode: "dark", contentWidth: "comfortable" }));
  localStorage.removeItem("notes-sidebar-collapsed");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const panel = page.locator('[data-slot="chat-sidebar-panel"]');
const mode = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const target = resolve("artifacts/editor-qa/showcase.png");

try {
  await page.goto(process.env.APP_URL || "http://localhost:1420");
  await page.locator('.ProseMirror[contenteditable="true"]').waitFor();
  await mode.click();
  for (const content of [
    "# Plan tygodnia\n\n- Pomiary\n- Analiza\n- Wnioski\n",
    "# Spotkanie zespołu\n\n## Ustalenia\n\nPorównujemy dane z pięciu dni.\n\n## Termin\n\nPiątek, 14:00.\n",
    await readFile(resolve("examples/showcase.md"), "utf8"),
  ]) {
    await panel.getByRole("button", { name: "New note", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.trim() === "");
    await source.click();
    await page.keyboard.insertText(content);
    await panel.locator('p[role="status"]').waitFor({ state: "hidden" });
  }
  await mode.click();
  await page.locator(".chart-mount svg").nth(1).waitFor();
  await page.locator(".math-block .katex-display").waitFor();
  assert.equal(await page.locator(".chart-block").count(), 2);
  assert.equal(await page.locator(".ProseMirror table:visible").count(), 1);
  assert.ok((await page.locator(".chart-message").allTextContents()).every((text) => text === ""));
  const rows = panel.locator('[data-slot="sidebar-item-subtitle"]');
  assert.equal(await rows.count(), 4);
  for (const row of await rows.all()) {
    assert.ok(await row.locator("time").getAttribute("datetime"));
  }
  const editedAt = await rows.first().locator("time").getAttribute("datetime");
  await panel.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).first().click();
  await page.locator(".chart-mount svg").nth(1).waitFor();
  assert.equal(await rows.first().locator("time").getAttribute("datetime"), editedAt,
    "Changing views should preserve the actual edit time");
  await page.locator(".note-scroll").evaluate((el) => { el.scrollTop = 0; });
  await page.mouse.move(1260, 20);
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(errors, []);
  await mkdir(resolve("artifacts/editor-qa"), { recursive: true });
  await page.screenshot({ path: target });
  console.log("PASS: two charts, formulas, table, checklist, code, sidebar metadata, unchanged edit time on navigation");
  console.log(target);
} catch (error) {
  await mkdir(resolve("artifacts/editor-qa"), { recursive: true });
  await page.screenshot({ path: resolve("artifacts/editor-qa/showcase-failure.png") });
  console.error(await source.allTextContents(), errors);
  throw error;
} finally {
  await browser.close();
}
