import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await context.addInitScript(() => localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, autocomplete: false })));
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420");
  const toggle = page.getByRole("button", { name: "Markdown source", exact: true });
  const rich = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
  const source = page.locator(".cm-content");
  await rich.waitFor(); await toggle.click();
  await source.click(); await page.keyboard.press("Control+a"); await page.keyboard.insertText("First\n\nSecond");
  for (const editor of [source, rich]) {
    if (editor === rich) { await toggle.click(); await rich.waitFor(); }
    await editor.click(); await page.keyboard.press("Control+a"); await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Copy / }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /First[\s\S]*Second/);
    await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Cut / }).click();
    await page.waitForFunction(() => !(document.querySelector('.cm-content, .note-scroll .ProseMirror')?.textContent || "").includes("First"));
    await editor.click(); await page.keyboard.press("Control+z");
    assert.match(await editor.innerText(), /First/);
    await page.evaluate(() => navigator.clipboard.writeText("# Pasted\n\nBody"));
    await page.keyboard.press("Control+a"); await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Paste / }).click();
    await page.waitForFunction(() => document.querySelector('.cm-content, .note-scroll .ProseMirror')?.textContent.includes("Body"));
    if (editor === rich) assert.equal(await rich.locator("h1").innerText(), "Pasted");
    await editor.click(); await page.keyboard.press("Control+z");
    assert.match(await editor.innerText(), /First/);
    await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Select all / }).click();
    await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Copy / }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /First[\s\S]*Second/);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: context menu copy, cut, multiline Markdown paste, select all and isolated undo in source and rich editors");
} catch (error) { console.error(await page.locator(".editor-context-region").innerText()); throw error; }
finally { await browser.close(); }
