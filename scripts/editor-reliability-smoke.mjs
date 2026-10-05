import assert from "node:assert/strict";
import { createServer } from "node:http";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const requests = [];
let aborted = 0;
const ollama = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.end(); return; }
  if (req.url === "/api/tags") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: [{ name: "test" }] })); return; }
  let raw = "";
  req.on("data", chunk => { raw += chunk; });
  req.on("end", () => {
    const body = JSON.parse(raw);
    requests.push(body);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.write(JSON.stringify({ response: " write not", done: false }) + "\n");
    const timer = setTimeout(() => { res.end(JSON.stringify({ response: "es", done: true }) + "\n"); }, 900);
    res.on("close", () => { clearTimeout(timer); if (!res.writableFinished) aborted++; });
  });
});
await new Promise(resolve => ollama.listen(0, "127.0.0.1", resolve));
const host = `http://127.0.0.1:${ollama.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(host => localStorage.setItem("notes-settings", JSON.stringify({ ollamaHost: host, model: "test", autocomplete: true })), host);
const editor = page.locator('.ProseMirror[contenteditable="true"]');
const replace = async (text) => { await editor.click(); await page.keyboard.press("Control+a"); await page.keyboard.type(text, { delay: 1 }); };
const mode = page.getByRole("button", { name: "Markdown source", exact: true });
const paste = (text) => editor.evaluate((el, value) => {
  const data = new DataTransfer(); data.setData("text/plain", value);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}, text);
try {
  await page.goto(process.env.APP_URL || "http://localhost:1420");
  await editor.waitFor();
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await replace("Today I");
  const started = Date.now();
  await page.locator(".ghost-text").waitFor();
  assert.equal(await page.locator(".ghost-text").textContent(), " write");
  assert.ok(Date.now() - started < 850, "First whole word should arrive before the 900 ms stream finishes");
  assert.equal(requests.at(-1).stream, true);
  assert.equal(requests.at(-1).options.num_ctx, 1024);
  await page.keyboard.type(" w");
  assert.equal(await page.locator(".ghost-text").textContent(), "rite");
  await page.waitForFunction(() => document.querySelector(".ghost-text")?.textContent === "rite");
  await page.keyboard.press("Tab");
  assert.equal(await editor.textContent(), "Today I write");
  console.log("PASS: paused word triggers, streaming appears early, matching typing retains the suffix and Tab accepts it");

  await replace("I could");
  await page.locator(".ghost-text").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".ghost-text"));
  await page.waitForTimeout(200);
  assert.ok(aborted >= 1, "Changing context must close an outstanding model stream");
  console.log("PASS: Escape and typing close stale model streams");

  await replace("$$x^2$ tail");
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type("$");
  assert.match(await editor.textContent(), /tail/);
  await mode.click();
  assert.match(await page.locator(".cm-content").innerText(), /tail/);
  await mode.click();
  console.log("PASS: completing a display fence in mid-paragraph preserves the following text");

  await replace("$$x^2$$ after");
  assert.equal(await page.locator(".math-block").count(), 1);
  assert.equal(await page.locator(".math-block .math-source").textContent(), "$$\nx^2\n$$");
  assert.match(await editor.locator("p").last().textContent(), /after/);
  console.log("PASS: closing display math moves the caret to normal prose");

  await replace(String.raw`Before \$x^2$ after`);
  assert.equal(await page.locator(".math-inline").count(), 0);
  console.log("PASS: an escaped dollar does not open an inline formula");

  await editor.click(); await page.keyboard.press("Control+a");
  await paste("# Adjacent\n\n$$\nx^2\n$$\n\n$$\ny^2\n$$");
  await page.locator("h1").click();
  await page.locator(".math-block .math-rendered").first().click();
  await page.keyboard.type("z+");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".math-block.math-editing").count(), 0);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Between");
  assert.match(await editor.textContent(), /Between/);
  assert.equal(await page.locator(".math-block").count(), 2);
  assert.equal(await page.locator(".math-block .math-source").nth(1).textContent(), "$$\ny^2\n$$");
  assert.equal(await page.locator(".math-block .katex-display").count(), 2);
  await page.keyboard.press("Control+z");
  assert.equal(await page.locator(".math-block").count(), 2);
  console.log("PASS: editing, Escape, writing between adjacent formulas and undo keep both formulas intact");
  assert.deepEqual(errors, []);
  console.log("PASS: no uncaught browser errors");
} finally { await browser.close(); await new Promise(resolve => ollama.close(resolve)); }
