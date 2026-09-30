import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Uses only an isolated browser vault; desktop notes and settings are untouched.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
await context.addInitScript(() => {
  localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, colorMode: "dark", palette: "ink", contentWidth: "comfortable" }));
  localStorage.removeItem("notes-sidebar-collapsed");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const panel = page.locator('[data-slot="chat-sidebar-panel"]');
const sourceMode = page.getByRole("button", { name: "Markdown source", exact: true });
const editor = page.locator('.ProseMirror[contenteditable="true"]');
const scroller = page.locator(".note-scroll");
const dir = resolve("artifacts/redesign");
await mkdir(dir, { recursive: true });

async function createNote(markdown, pin = false) {
  await panel.getByRole("button", { name: "New note", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.trim() === "");
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(markdown);
  await panel.locator('[role="status"]').waitFor({ state: "hidden" });
  if (pin) {
    const row = panel.locator('[data-slot="sidebar-item-button"][data-active="true"]');
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  }
}

try {
  await page.goto(process.env.APP_URL || "http://localhost:1420");
  await editor.waitFor();
  await sourceMode.click();
  await createNote("# Plan tygodnia\n\n- Pomiary\n- Analiza\n- Wnioski\n");
  await createNote("# Spotkanie zespołu\n\n## Ustalenia\n\nPorównujemy dane z pięciu dni.\n\n## Termin\n\nPiątek, 14:00.\n", true);
  await createNote(await readFile(resolve("examples/showcase.md"), "utf8"), true);
  await sourceMode.click();
  await page.locator(".chart-mount svg").nth(1).waitFor();
  await page.locator(".math-block .katex-display").waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await scroller.evaluate((el) => { el.scrollTop = 0; });
  await page.mouse.move(1260, 880);
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".app-header-title")).opacity === "0");
  assert.equal(await panel.locator('[data-pinned="true"] [data-slot="sidebar-item-subtitle"]').count(), 0);
  assert.equal(await panel.locator('[data-pinned="true"] [data-slot="sidebar-item-button"] svg').count(), 0);
  assert.equal(await page.locator(".app-header").innerText(), "Energia i pomiary");
  await page.screenshot({ path: resolve(dir, "desktop.png") });

  const fadeStart = await page.locator("h1").evaluate((el) => el.getBoundingClientRect().bottom - 66);
  await scroller.evaluate((el, amount) => { el.scrollTop = amount; }, fadeStart);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".app-header-title")).opacity) > 0);
  const fade = await scroller.evaluate((el) => ({
    mask: getComputedStyle(el).maskImage,
    titleOpacity: getComputedStyle(document.querySelector(".app-header-title")).opacity,
    scrollTop: el.scrollTop,
    headingTop: document.querySelector("h1").getBoundingClientRect().top,
  }));
  assert.match(fade.mask, /linear-gradient/);
  await page.screenshot({ path: resolve(dir, "scroll-fade.png") });
  await scroller.evaluate((el) => { el.scrollTop = 220; });
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".app-header-title")).opacity === "1");
  await page.screenshot({ path: resolve(dir, "scrolled.png") });
  await scroller.evaluate((el) => { el.scrollTop = 0; });
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".app-header-title")).opacity === "0");

  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Search notes", exact: true });
  await search.fill("Spotkanie");
  assert.equal(await panel.locator('[data-slot="sidebar-item-button"]').count(), 1);
  await search.press("Escape");
  await search.waitFor({ state: "hidden" });
  await panel.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.locator('[data-slot="chat-sidebar"][data-collapsed="true"]').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-slot="chat-sidebar-panel"]')).opacity === "0");
  await page.screenshot({ path: resolve(dir, "collapsed.png") });
  await page.locator('[data-slot="chat-sidebar-rail"]').getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".settings-page").waitFor();
  await page.getByRole("button", { name: "Back to notes", exact: true }).first().click();
  await editor.waitFor();
  await page.locator('[data-slot="chat-sidebar-rail"]').getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-slot="chat-sidebar-panel"]')).opacity === "1");

  await page.setViewportSize({ width: 800, height: 600 });
  await page.screenshot({ path: resolve(dir, "compact.png") });
  assert.equal(await page.locator(".app").evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByLabel("Color mode", { exact: true }).getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).first().click();
  await editor.waitFor();
  await page.locator(".chart-mount svg").nth(1).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-color-mode"), "light");
  await page.screenshot({ path: resolve(dir, "light.png") });
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "checks.json"), JSON.stringify({ passed: true, fade, errors, checks: ["compact pins", "title handoff", "scroll fade", "Ctrl+K search", "collapsed settings navigation", "800px layout", "light theme", "charts and formulas"] }, null, 2));
  console.log("PASS: compact pins, fading document/title, search, collapsed navigation, compact layout, light theme, charts and formulas");
  console.log(dir, fade);
} catch (error) {
  await page.screenshot({ path: resolve(dir, "failure.png") });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
