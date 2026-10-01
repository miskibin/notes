import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// An isolated browser vault and mocked Ollama: no desktop notes or model jobs are touched.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pl-PL" });
await context.addInitScript(() => localStorage.setItem("notes-settings", JSON.stringify({
  appearanceRev: 2, colorMode: "dark", palette: "ink", contentWidth: "comfortable",
  autocomplete: true, model: "test-complete", editModel: "test-edit",
})));
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", error => errors.push(error.message));
let chatMode = "success";
let completionMode = "success";
let releaseChat;
let releaseCompletion;
const original = "Energia i pomiary\n\nBadamy zależność E = mc^2. Masa wynosi 2 kg.\n\nPlan badania\nPrzygotować próbki. Zmierzyć masę. Porównać wyniki.";
const formatted = "# Energia i pomiary\n\nBadamy zależność $E = mc^2$. Masa wynosi 2 kg.\n\n## Plan badania\n\n- Przygotować próbki.\n- Zmierzyć masę.\n- Porównać wyniki.";
await page.route("**/api/tags", route => route.fulfill({ json: { models: [{ name: "test-complete" }, { name: "test-edit" }] } }));
await page.route("**/api/chat", async route => {
  requests.push(route.request().postDataJSON());
  const mode = chatMode;
  if (mode === "delayed") await new Promise(resolve => { releaseChat = resolve; });
  await route.fulfill({ json: mode === "truncated" ? { message: { content: "# Incomplete" }, done_reason: "length" } :
    mode === "empty" ? { message: { content: "" } } : { message: { content: formatted }, done_reason: "stop" } }).catch(() => {});
});
await page.route("**/api/generate", async route => {
  const mode = completionMode;
  if (mode === "delayed") await new Promise(resolve => { releaseCompletion = resolve; });
  await route.fulfill({ status: mode === "error" ? 503 : 200,
    json: mode === "error" ? { error: "Ollama is offline" } : { response: "kolejna myśl.", done_reason: "stop" } });
});
const artifacts = resolve("artifacts/polish");
await mkdir(artifacts, { recursive: true });
const footer = page.locator(".app-footer");
const sourceButton = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const readSource = async () => (await source.locator(".cm-line").allTextContents()).join("\n");
const editor = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const dialog = page.getByRole("dialog", { name: "Format Markdown", exact: true });
const formatButton = footer.getByRole("button", { name: "Format Markdown", exact: true });
const save = () => page.waitForFunction(() => document.querySelector(".footer-save")?.textContent === "Saved");
async function openFormat() { await formatButton.click(); await dialog.waitFor(); }
async function closeFormat() { await dialog.getByRole("button", { name: "Close formatting preview" }).click(); await dialog.waitFor({ state: "hidden" }); }

try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420");
  await editor.waitFor();
  await sourceButton.click();
  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(original);
  await save();
  assert.match(await footer.innerText(), /Paused/);
  await openFormat();
  await dialog.getByRole("heading", { name: "Energia i pomiary", exact: true }).waitFor();
  assert.equal(await dialog.locator('.ProseMirror[contenteditable="true"]').count(), 0);
  assert.equal(await dialog.locator(".katex").count(), 1);
  assert.equal(await dialog.locator(".ProseMirror li").count(), 3);
  assert.equal(requests.length, 1, "StrictMode must not send duplicate format requests");
  assert.equal(requests[0].model, "test-edit");
  assert.ok(requests[0].messages[1].content.endsWith(original));
  await page.screenshot({ path: resolve(artifacts, "preview-dark.png") });
  // Keyboard focus remains inside the native modal.
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  }
  await dialog.getByRole("button", { name: "Markdown", exact: true }).click();
  assert.equal(await dialog.locator(".format-source").textContent(), formatted);
  await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await save();
  assert.equal(await readSource(), formatted);
  await source.click();
  await page.keyboard.press("Control+z");
  assert.equal(await readSource(), original, "source formatting must undo in one step");
  await save();

  await sourceButton.click();
  await editor.waitFor();
  await openFormat();
  await dialog.getByRole("heading", { name: "Energia i pomiary", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator(".note-scroll h1").waitFor();
  await save();
  await page.screenshot({ path: resolve(artifacts, "desktop-dark.png") });
  await editor.click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => !document.querySelector(".note-scroll h1"));
  assert.match(await editor.innerText(), /Badamy zależność E = mc\^2/);
  await save();

  // Cancel late responses; truncated or empty responses cannot replace the note.
  chatMode = "delayed";
  await openFormat();
  await page.waitForFunction(() => document.querySelector(".format-body")?.getAttribute("aria-busy") === "true");
  await page.waitForTimeout(150);
  assert.ok(releaseChat);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  releaseChat();
  chatMode = "truncated";
  await openFormat();
  await dialog.getByText(/model stopped before finishing/).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Apply formatting" }).isDisabled(), true);
  chatMode = "success";
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await dialog.getByRole("heading", { name: "Energia i pomiary", exact: true }).waitFor();
  await closeFormat();
  assert.equal(await page.locator(".note-scroll h1").count(), 0);

  // Autocomplete shows real request/suggestion/error states and clears on toggle.
  completionMode = "delayed";
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" Dodatkowa myśl ");
  await footer.getByText("· Thinking…", { exact: true }).waitFor();
  assert.ok(releaseCompletion);
  releaseCompletion();
  await footer.getByText("· Tab to accept", { exact: true }).waitFor();
  await page.keyboard.press("Tab");
  assert.match(await editor.innerText(), /kolejna myśl\./);
  await page.keyboard.press("Escape");
  await footer.getByRole("button", { name: "Toggle autocomplete" }).click();
  assert.match(await footer.innerText(), /Off/);
  assert.equal(await page.locator(".ghost-text").count(), 0);
  await footer.getByRole("button", { name: "Toggle autocomplete" }).click();
  completionMode = "error";
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" Następne zdanie ");
  await footer.getByText("· Unavailable", { exact: true }).waitFor();
  assert.match(await footer.getByRole("button", { name: "Toggle autocomplete" }).getAttribute("title"), /Ollama is offline/);
  completionMode = "delayed";
  await page.keyboard.insertText(" Jeszcze jedna myśl ");
  await footer.getByText("· Thinking…", { exact: true }).waitFor();
  await footer.getByRole("button", { name: "Toggle autocomplete" }).click();
  releaseCompletion();
  await page.waitForTimeout(250);
  assert.match(await footer.innerText(), /Off/);
  assert.equal(await page.locator(".ghost-text").count(), 0, "late completion cannot survive disabling autocomplete");
  await save();
  await page.setViewportSize({ width: 800, height: 600 });
  assert.equal(await page.locator(".app").evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.screenshot({ path: resolve(artifacts, "compact.png") });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByLabel("Color mode", { exact: true }).getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Back to notes", exact: true }).first().click();
  await editor.waitFor();
  await page.screenshot({ path: resolve(artifacts, "desktop-light.png") });
  await openFormat();
  await dialog.getByRole("heading", { name: "Energia i pomiary", exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "preview-light.png") });
  await closeFormat();
  // Missing model has a clear recovery path and never submits a formatting request.
  await page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Edit model", { exact: true }).selectOption("");
  await page.getByLabel("Autocomplete model", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Back to notes", exact: true }).first().click();
  await editor.waitFor();
  const submitted = requests.length;
  await openFormat();
  await dialog.getByRole("heading", { name: "Choose an edit model", exact: true }).waitFor();
  assert.equal(requests.length, submitted);
  await closeFormat();
  await footer.getByRole("button", { name: "Toggle autocomplete" }).click();
  assert.match(await footer.innerText(), /Choose model/);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("12 + 4 = ");
  await footer.getByText("· Tab to accept", { exact: true }).waitFor();
  await page.keyboard.press("Tab");
  assert.match(await editor.innerText(), /12 \+ 4 = 16/);
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, "checks.json"), JSON.stringify({ passed: true, errors, formatRequests: requests.length,
    checks: ["footer", "Markdown/math preview", "source apply & undo", "rich apply & undo", "focus trap", "cancel late response",
      "truncation & retry", "autocomplete loading/suggestion/error/toggle", "late completion suppression", "missing model recovery",
      "local arithmetic without a model", "800px layout", "dark & light"] }, null, 2));
  console.log("PASS: footer, formatting preview/apply/undo, cancellation, errors, autocomplete states, compact layout and themes");
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, "failure.png") });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
