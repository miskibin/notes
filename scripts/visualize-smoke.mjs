import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await context.addInitScript(() => localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, editModel: "test-edit", autocomplete: false })));
const page = await context.newPage();
const appUrl = process.env.APP_URL || "http://127.0.0.1:1420";
const errors = [], outbound = [], submitted = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if (!request.url().startsWith(new URL(appUrl).origin) && !request.url().startsWith("data:")) outbound.push(request.url()); });
let mode = "success", calls = 0;
const recipe = {
  title: "Rozkład normalny", caption: "Ilustracja dla średniej 0 i odchylenia 1; nie są to pomiary.", kind: "illustrative",
  code: "from scipy import stats\nx = np.linspace(-4, 4, 300)\nfig, ax = plt.subplots(figsize=(8, 4.5))\nax.plot(x, stats.norm.pdf(x), color='#4974a5', linewidth=2)\nax.set_title('Rozkład normalny')\nax.set_xlabel('Wartość')\nax.set_ylabel('Gęstość')\nfig.tight_layout()",
};
await page.route("**/api/chat", async route => {
  submitted.push(route.request().postDataJSON()); calls++;
  if (mode === "delayed") await new Promise(resolve => setTimeout(resolve, 500));
  const next = mode === "invalid" || mode === "repair" && calls === 1 ? { ...recipe, code: "import os\nos.listdir('/')" } : mode === "slow" ? { ...recipe, code: "while True: pass" } : recipe;
  await route.fulfill({ json: { message: { content: JSON.stringify(next) }, done_reason: "stop" } });
});
const sourceButton = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const editor = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const activity = page.getByRole("region", { name: "Visualization activity", exact: true });
const artifacts = resolve("artifacts/visualize");
await mkdir(artifacts, { recursive: true });
async function selection() { await source.click(); await page.keyboard.press("Control+a"); }
async function open() { calls = 0; await page.keyboard.press("Control+Alt+v"); await activity.waitFor(); assert.equal(await page.locator("dialog[open]").count(), 0); }
async function dismiss() { await activity.getByRole("button", { name: "Dismiss visualization activity" }).click(); await activity.waitFor({ state: "hidden" }); }
async function done() { await activity.getByText("Chart inserted", { exact: true }).waitFor({ timeout: 120_000 }); }
try {
  await page.goto(appUrl); await editor.waitFor(); await sourceButton.click();
  await source.click(); await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Rozkład normalny: większość wartości skupia się wokół średniej, a skrajne są rzadkie.");
  await selection(); await source.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Visualize/ }).click(); await activity.waitFor(); await done();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.match(await source.textContent(), /data:image\/png;base64/);
  assert.equal(submitted.length, 1); assert.equal(submitted[0].model, "test-edit");
  await activity.locator(".visualize-trace > summary").click();
  await activity.locator(".visualize-step").nth(1).locator("summary").click();
  assert.match(await activity.innerText(), /ax.plot/);
  await page.screenshot({ path: resolve(artifacts, "inline-trace.png") });
  await source.click(); await page.keyboard.press("Control+z"); assert.doesNotMatch(await source.textContent(), /data:image/); await dismiss();

  console.log("PASS: source insertion, undo and trace");
  // A failed tool call gives the model the exact error and previous code.
  mode = "repair"; await selection(); await open(); await done();
  assert.equal(calls, 2); assert.match(submitted.at(-1).messages[3].content, /Unsupported import: os/);
  assert.match(submitted.at(-1).messages[2].content, /os.listdir/);
  await source.click(); await page.keyboard.press("Control+z"); await dismiss();

  console.log("PASS: repair feedback and successful retry");
  // Cancel a running infinite loop without blocking typing or triggering repairs.
  mode = "slow"; await selection(); await open();
  await activity.getByText("Drawing the chart…", { exact: true }).waitFor({ timeout: 120_000 });
  await activity.getByRole("button", { name: "Cancel", exact: true }).click();
  await activity.getByText("Cancelled", { exact: true }).first().waitFor();
  await source.click(); assert.doesNotMatch(await source.textContent(), /data:image/); assert.equal(calls, 1); await dismiss();

  console.log("PASS: running worker cancellation");
  // Three repeated tool failures exhaust the repair budget and retain the note.
  mode = "invalid"; await selection(); await open();
  await activity.getByRole("alert").filter({ hasText: /after 3 attempts/ }).waitFor({ timeout: 120_000 });
  assert.equal(calls, 3); assert.doesNotMatch(await source.textContent(), /data:image/); await dismiss();

  console.log("PASS: exhausted repair budget");
  // Edits made during generation are never overwritten by the stale selection.
  mode = "delayed"; await selection(); await open(); await page.keyboard.insertText("Changed during generation");
  await activity.getByRole("alert").filter({ hasText: /note changed/ }).waitFor({ timeout: 120_000 });
  assert.match(await source.textContent(), /Changed during generation/); assert.doesNotMatch(await source.textContent(), /data:image/); await dismiss();

  console.log("PASS: stale selection rejected");
  // Rich-editor insertion is automatic, keeps the original idea and is one undo step.
  mode = "success"; await sourceButton.click(); await editor.waitFor();
  await editor.click(); await page.keyboard.press("Control+a"); await open(); await done(); await editor.locator("img").waitFor();
  const image = await editor.locator("img").evaluate(el => ({ width: el.naturalWidth, height: el.naturalHeight }));
  assert.ok(image.width > 500 && image.height > 300);
  await page.screenshot({ path: resolve(artifacts, "inserted.png") });
  assert.match(await editor.innerText(), /Changed during generation/);
  await editor.click(); await page.keyboard.press("Control+z");
  await page.waitForFunction(() => !document.querySelector(".note-scroll .ProseMirror img")); await dismiss();
  assert.deepEqual(errors, []); assert.ok(outbound.every(url => url.startsWith("http://127.0.0.1:11434/")), outbound.join("\n"));
  await writeFile(resolve(artifacts, "checks.json"), JSON.stringify({ passed: true, errors, image, checks: ["no modal", "automatic PNG insertion", "source/rich undo", "inspectable trace", "Python error repair", "three-attempt budget", "running cancellation", "stale-selection rejection", "no runtime CDN"] }, null, 2));
  console.log("PASS: inline chart, real Python PNG, repairs/trace, cancellation, stale-selection rejection and undo");
} catch (error) { await page.screenshot({ path: resolve(artifacts, "failure.png") }); console.error(errors); throw error; }
finally { await browser.close(); }
