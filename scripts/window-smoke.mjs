import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  let next = 0; const callbacks = new Map();
  const files = new Map([["a.md", "# Alpha\n\nA useful note."], ["b.md", "# Beta\n\nAnother note."]]);
  const state = window.windowTest = { calls: [], effectError: false, readSlow: false };
  localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, vault: "Test", autocomplete: false, editModel: "test" }));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" } },
    transformCallback: callback => { callbacks.set(++next, callback); return next; },
    invoke: async (command, args) => {
      if (command === "plugin:event|listen") return ++next;
      if (command === "plugin:event|unlisten") return;
      if (command.startsWith("plugin:window|")) {
        state.calls.push({ command, args });
        if (command.endsWith("set_effects") && args.value && state.effectError) throw new Error("Effect unavailable");
        return;
      }
      if (command === "list_models") return ["test"];
      if (command === "list_notes") return [...files].map(([name, body]) => ({ name, title: body.match(/^# (.*)$/m)[1], modified_ms: name === "a.md" ? 2 : 1, line_count: 3 }));
      if (command === "read_note") { if (state.readSlow) await new Promise(resolve => setTimeout(resolve, 800)); return files.get(args.name); }
      if (command === "write_note") { files.set(args.name, args.body); return; }
      if (command === "list_history") return [{ id: "old", note: "a.md", modified_ms: Date.now(), deleted: false }];
      if (command === "read_history") return "# Alpha\n\nEarlier version.";
      if (command === "format_note") return "# Formatted\n\nA useful note.";
      throw new Error(`Unexpected command ${command}`);
    },
  };
});
const artifacts = resolve("artifacts/window-review"); await mkdir(artifacts, { recursive: true });
const rich = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const controls = () => page.getByRole("group", { name: "Window controls", exact: true });
async function checkControls() {
  const group = controls(); assert.equal(await group.count(), 1);
  for (const name of ["Minimize", "Maximize or restore", "Close"]) {
    const button = group.getByRole("button", { name, exact: true });
    const rect = await button.boundingBox(); assert.ok(rect && rect.y === 0 && rect.height < 80 && rect.x + rect.width <= 1100);
    assert.equal(await button.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
    await button.click();
  }
}
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420"); await rich.waitFor();
  // Tauri uses the actual hit target, not an ancestor's drag attribute.
  const spacer = page.locator(".app-header-spacer");
  const headerRect = await page.locator(".app-header").boundingBox();
  const dragRect = await spacer.boundingBox();
  assert.ok(dragRect && dragRect.height === headerRect.height && dragRect.width > 100);
  for (const fraction of [0.1, 0.5, 0.9]) {
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute("data-tauri-drag-region"),
      { x: dragRect.x + dragRect.width / 2, y: dragRect.y + dragRect.height * fraction }), true);
  }
  assert.equal(await page.locator(".app-header-title span").evaluate(element => element.hasAttribute("data-tauri-drag-region")), true);
  for (const button of await page.locator(".app-header button, .window-controls button").all()) {
    assert.equal(await button.evaluate(element => { const r = element.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.hasAttribute("data-tauri-drag-region"); }), false);
  }
  console.log("PASS: full-height titlebar hit targets drag; action buttons do not");
  await checkControls();
  assert.equal(await page.evaluate(() => window.windowTest.calls.some(call => call.command.endsWith("set_effects"))), false);
  await page.evaluate(() => { window.windowTest.readSlow = true; });
  await page.locator('[data-slot=sidebar-item-button]').filter({ hasText: "Beta" }).click();
  await page.locator(".app-body[inert]").waitFor(); await checkControls();
  await rich.getByRole("heading", { name: "Beta", exact: true }).waitFor();
  await page.evaluate(() => { window.windowTest.readSlow = false; });
  console.log("PASS: window controls remain clickable during navigation");
  for (const shortcut of ["Control+Shift+l", "Control+k"]) {
    await page.keyboard.press(shortcut); await page.locator("dialog[open]").waitFor(); await checkControls();
    await page.keyboard.press("Escape"); await page.locator("dialog[open]").waitFor({ state: "hidden" });
  }
  await page.getByRole("button", { name: /History/ }).click(); await page.locator("dialog[open]").waitFor(); await checkControls();
  await page.screenshot({ path: resolve(artifacts, "history-controls.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Format Markdown", exact: true }).click(); await page.locator("dialog[open]").waitFor(); await checkControls();
  await page.keyboard.press("Escape");
  await rich.click({ button: "right" }); await page.getByRole("menu").waitFor();
  assert.notEqual(await page.evaluate(() => document.body.style.pointerEvents), "none"); await checkControls();
  console.log("PASS: native controls inside all modal top layers and non-blocking context menus");
  // The shared resize rail is not enabled in the current notes sidebar.
  // Mount it independently to verify its interrupted-gesture cleanup.
  await page.evaluate(async () => {
    const { default: { createElement } } = await import("/node_modules/.vite/deps/react.js");
    const { default: { createRoot } } = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { SidebarResizeRail } = await import("/src/vendor/chat-components/components/ui/sidebar-resize-rail.tsx");
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;bottom:36px;width:250px;height:80px;z-index:1500";
    document.body.append(host);
    const root = createRoot(host); window.resizeTest = { root, host };
    root.render(createElement(SidebarResizeRail, { targetRef: { current: host }, width: 250 }));
  });
  const rail = page.getByRole("separator", { name: "Resize sidebar", exact: true });
  for (const finish of ["blur", "Escape", "lostcapture"]) {
    await page.evaluate(() => { document.body.style.cursor = "crosshair"; document.body.style.userSelect = "text"; });
    const rect = await rail.boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
    await page.mouse.move(rect.x + 40, rect.y + rect.height / 2); 
    assert.equal(await rail.getAttribute("data-resizing"), "true");
    if (finish === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (finish === "Escape") await page.keyboard.press("Escape");
    else { await rail.evaluate(element => element.releasePointerCapture(1)); await page.mouse.move(rect.x + 41, rect.y + rect.height / 2); }
    await page.waitForFunction(() => !document.querySelector('[data-resizing="true"]'));
    assert.deepEqual(await page.evaluate(() => [document.body.style.cursor, document.body.style.userSelect]), ["crosshair", "text"]);
    await page.mouse.up();
  }
  await page.evaluate(() => { document.body.style.cursor = ""; document.body.style.userSelect = ""; });
  await page.evaluate(() => { window.resizeTest.root.unmount(); window.resizeTest.host.remove(); });
  console.log("PASS: resize capture releases on blur, Escape and lost pointer capture");
  await page.locator("[data-slot=chat-sidebar-panel]").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const glass = page.getByRole("switch", { name: "Frosted glass", exact: true });
  assert.equal(await glass.getAttribute("aria-checked"), "false");
  await glass.click(); await page.waitForFunction(() => document.documentElement.dataset.frostedGlass === "true");
  assert.equal(await page.evaluate(() => window.windowTest.calls.find(call => call.command.endsWith("set_effects")).args.value.effects[0]), "acrylic");
  await glass.click(); await page.waitForFunction(() => document.documentElement.dataset.frostedGlass === "false");
  await page.waitForFunction(() => window.windowTest.calls.at(-1)?.command.endsWith("set_shadow") && window.windowTest.calls.at(-1)?.args.value === true);
  await page.evaluate(() => { window.windowTest.effectError = true; }); await glass.click();
  await page.getByText(/Frosted glass unavailable: Effect unavailable/).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.frostedGlass), "false");
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: resolve(artifacts, "glass-settings.png") });
  assert.deepEqual(errors, []);
  console.log("PASS: frosted glass opt-in, native effect bridge, opaque fallback and shadow restoration");
} catch (error) { await page.screenshot({ path: resolve(artifacts, "failure.png") }); throw error; }
finally { await browser.close(); }
