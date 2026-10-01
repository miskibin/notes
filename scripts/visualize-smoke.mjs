import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, editModel: "test-edit", autocomplete: false })));
const page = await context.newPage();
const appUrl = process.env.APP_URL || "http://127.0.0.1:1420";
const errors = [];
const outbound = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text().slice(0, 400)); });
page.on("request", request => { if (!request.url().startsWith(new URL(appUrl).origin) && !request.url().startsWith("data:")) outbound.push(request.url()); });
let mode = "success", submitted = [];
const recipe = {
  title: "Rozkład normalny", caption: "Ilustracja dla średniej 0 i odchylenia standardowego 1; nie są to pomiary.", kind: "illustrative",
  code: "from scipy import stats\nx = np.linspace(-4, 4, 300)\nfig, ax = plt.subplots(figsize=(8, 4.5))\nax.plot(x, stats.norm.pdf(x), color='#4974a5', linewidth=2)\nax.fill_between(x, stats.norm.pdf(x), alpha=0.12, color='#4974a5')\nax.set_title('Rozkład normalny')\nax.set_xlabel('Wartość')\nax.set_ylabel('Gęstość prawdopodobieństwa')\nax.grid(alpha=0.15)\nfig.tight_layout()",
};
await page.route("**/api/chat", route => {
  submitted.push(route.request().postDataJSON());
  const next = mode === "invalid" ? { ...recipe, code: "import os\nos.listdir('/')" } : mode === "slow" ? { ...recipe, code: "while True: pass" } : recipe;
  return route.fulfill({ json: { message: { content: JSON.stringify(next) }, done_reason: "stop" } });
});
const sourceButton = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const editor = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const dialog = page.getByRole("dialog", { name: "Visualize", exact: true });
const artifacts = resolve("artifacts/visualize");
await mkdir(artifacts, { recursive: true });
async function selection() {
  await source.click(); await page.keyboard.press("Control+a");
}
async function open() { await page.keyboard.press("Control+Alt+v"); await dialog.waitFor(); }
try {
  await page.goto(appUrl);
  await editor.waitFor(); await sourceButton.click();
  await source.click(); await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Rozkład normalny: większość wartości skupia się wokół średniej, a skrajne są rzadkie.");
  await selection();
  await source.click({ button: "right" });
  const action = page.getByRole("menuitem", { name: /Visualize/ });
  assert.equal(await action.getAttribute("data-disabled"), null);
  await page.screenshot({ path: resolve(artifacts, "context-menu.png") });
  await action.click(); await dialog.waitFor();
  await dialog.locator(".visualize-figure img").waitFor({ timeout: 120_000 });
  const image = await dialog.locator("img").evaluate(el => ({ width: el.naturalWidth, height: el.naturalHeight, src: el.src }));
  assert.ok(image.width > 500 && image.height > 300);
  assert.ok(image.src.startsWith("data:image/png;base64,iVBOR"));
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].model, "test-edit");
  assert.match(submitted[0].messages[1].content, /Rozkład normalny/);
  await dialog.getByText("Illustrative", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "preview.png") });
  await dialog.getByRole("button", { name: "Python", exact: true }).click();
  assert.equal(await dialog.getByLabel("Chart Python code").textContent(), recipe.code);
  await dialog.getByRole("button", { name: "Insert chart", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.match(await source.textContent(), /data:image\/png;base64/);
  await source.click(); await page.keyboard.press("Control+z");
  assert.doesNotMatch(await source.textContent(), /data:image/);

  // A running computation can be cancelled without blocking the editor.
  mode = "slow";
  await selection(); await open();
  await dialog.getByRole("heading", { name: "Drawing the chart…" }).waitFor({ timeout: 120_000 });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await source.click();
  assert.doesNotMatch(await source.textContent(), /data:image/);

  // The parent terminates an infinite loop on its execution deadline.
  await selection(); await open();
  await dialog.getByText(/chart took too long/).waitFor({ timeout: 150_000 });
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });

  // A forbidden model operation is rejected before execution, with the original intact.
  mode = "invalid";
  await selection(); await open();
  await dialog.getByText(/Unsupported import: os/).waitFor({ timeout: 120_000 });
  assert.equal(await dialog.getByRole("button", { name: "Insert chart", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.doesNotMatch(await source.textContent(), /data:image/);

  // Rich-editor insertion retains the original idea and is one undo step.
  mode = "success";
  await sourceButton.click(); await editor.waitFor();
  await editor.click(); await page.keyboard.press("Control+a"); await open();
  await dialog.locator(".visualize-figure img").waitFor({ timeout: 120_000 });
  await dialog.getByRole("button", { name: "Insert chart", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await editor.locator("img").waitFor();
  await page.screenshot({ path: resolve(artifacts, "inserted.png") });
  assert.match(await editor.innerText(), /większość wartości/);
  await editor.click(); await page.keyboard.press("Control+z");
  await page.waitForFunction(() => !document.querySelector(".note-scroll .ProseMirror img"));
  assert.match(await editor.innerText(), /większość wartości/);
  await editor.click(); await page.keyboard.press("Control+a"); await open();
  await dialog.getByRole("button", { name: "Close visualization" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  // Only the local model endpoint is permitted; Pyodide packages never use a CDN at runtime.
  assert.ok(outbound.every(url => url.startsWith("http://127.0.0.1:11434/")), outbound.join("\n"));
  await writeFile(resolve(artifacts, "checks.json"), JSON.stringify({ passed: true, errors, width: image.width, height: image.height,
    checks: ["context menu", "keyboard shortcut", "real matplotlib/NumPy/SciPy worker", "code preview", "source insert & undo", "rich insert & undo", "forbidden import", "running cancellation", "infinite loop timeout", "no runtime CDN"] }, null, 2));
  console.log("PASS: Visualize menu/shortcut, actual scientific Python chart, source/rich insertion and undo, restricted code and cancellation");
} catch (error) { await page.screenshot({ path: resolve(artifacts, "failure.png") }); console.error(errors); throw error; }
finally { await browser.close(); }
