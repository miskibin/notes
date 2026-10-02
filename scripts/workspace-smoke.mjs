import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", dialog => dialog.accept());
const artifacts = resolve("artifacts/workspace-review");
await mkdir(artifacts, { recursive: true });
await page.addInitScript(() => {
  const callbacks = new Map(), listeners = new Map(); let next = 0;
  const files = new Map([
    ["Vault A", new Map([["a.md", "---\n# Keep this comment\ntags: [science]\nnotes:\n  id: alpha-id\n  references: []\n---\n# Alpha\n\nUnique phrase with **bold words**.\n\nLiteral \\[\\[Beta]] and real [[Beta]].\n\n`[[Alpha]]` stays code."], ["b.md", "# Beta\n\nTarget note"]])],
    ["Vault B", new Map([["a.md", "# Other folder\n\nDifferent content"]])],
  ]);
  const history = new Map(), bodies = new Map();
  const state = window.workspaceTest = { files, opened: [], history, bodies, writes: 0 };
  const archive = (vault, note, body, deleted) => {
    const id = crypto.randomUUID();
    history.set(vault, [{ id, note, deleted, modified_ms: Date.now() }, ...(history.get(vault) || [])]);
    bodies.set(`${vault}:${id}`, body);
  };
  localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, vault: "Vault A", autocomplete: false, editModel: "test-edit" }));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => listeners.delete(id) };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" } },
    transformCallback: callback => { const id = ++next; callbacks.set(id, callback); return id; },
    invoke: async (command, args) => {
      if (command === "plugin:event|listen") { const id = ++next; listeners.set(id, args); return id; }
      if (command === "plugin:event|unlisten") return;
      if (command === "plugin:opener|open_url") { state.opened.push(args.url); return; }
      if (command === "plugin:dialog|open") return "Vault B";
      if (command === "list_models") return [];
      const vault = files.get(args.vault);
      if (command === "list_notes") return [...vault].map(([name, body]) => ({ name, title: body.match(/^# (.*)$/m)?.[1] || name, modified_ms: name === "a.md" ? 2 : 1, line_count: 3 }));
      if (command === "read_note") { await new Promise(resolve => setTimeout(resolve, 60)); return vault.get(args.name); }
      if (command === "write_note") { const previous = vault.get(args.name); if (previous != null && previous !== args.body) archive(args.vault, args.name, previous, false); vault.set(args.name, args.body); state.writes++; return; }
      if (command === "delete_note") { const body = vault.get(args.name); if (body != null) archive(args.vault, args.name, body, true); vault.delete(args.name); return; }
      if (command === "list_history") return history.get(args.vault) || [];
      if (command === "read_history") return bodies.get(`${args.vault}:${args.id}`);
      throw new Error(`Unexpected test command: ${command}`);
    },
  };
});

const rich = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
const mode = page.getByRole("button", { name: "Markdown source", exact: true });
const source = page.locator(".cm-content");
const row = title => page.locator('[data-slot="sidebar-item-button"]').filter({ hasText: title });
const readSource = async () => (await source.locator(".cm-line").allTextContents()).join("\n");
const saved = () => page.waitForFunction(() => document.querySelector(".footer-save")?.textContent === "Saved");

try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420");
  await rich.waitFor();
  assert.equal(await rich.locator('[data-type="wiki-link"]').count(), 1);
  await page.locator(".reference-chip").filter({ hasText: "Beta" }).waitFor();
  await page.locator(".reference-chip").filter({ hasText: "Beta" }).click();
  await rich.getByRole("heading", { name: "Beta", exact: true }).waitFor();
  assert.equal(await page.getByText("1 linking note", { exact: true }).count(), 1);
  await mode.click(); await source.click(); await page.keyboard.press("Control+Home");
  const targetSource = await readSource();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(targetSource.replace("# Beta", "# Renamed Beta"));
  await saved(); await row("Alpha").click();
  await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.includes("# Alpha"));
  await mode.click(); await rich.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  await page.locator(".reference-chip").filter({ hasText: "Beta" }).click();
  await rich.getByRole("heading", { name: "Renamed Beta", exact: true }).waitFor();
  console.log("PASS: wiki references resolve unopened notes, retain ids after rename, and show backlinks");

  await row("Alpha").click(); await rich.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  await rich.click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" final keystroke");
  await row("Renamed Beta").click();
  await rich.getByRole("heading", { name: "Renamed Beta", exact: true }).waitFor();
  const stored = await page.evaluate(() => window.workspaceTest.files.get("Vault A").get("a.md"));
  assert.match(stored, /final keystroke/); assert.match(stored, /# Keep this comment/); assert.match(stored, /tags: \[\s*science\s*\]/);
  assert.match(stored, /\[\[Beta\]\]/);
  console.log("PASS: immediate rich-editor navigation saves the last character and untouched YAML");

  await row("Alpha").click(); await rich.waitFor();
  await rich.locator('[data-type="wiki-link"]').click({ modifiers: ["Control"] });
  await rich.getByRole("heading", { name: "Renamed Beta", exact: true }).waitFor();
  await row("Alpha").click(); await rich.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  assert.equal(await rich.locator('[data-type="wiki-link"]').count(), 1);
  await rich.click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" [[Renamed Beta]]");
  await page.waitForFunction(() => document.querySelectorAll('.note-scroll [data-type="wiki-link"]').length === 2);
  await saved();
  await mode.click();
  assert.match(await readSource(), /\[\[Renamed Beta\]\]/);
  await mode.click(); await rich.waitFor();
  console.log("PASS: literal/code wiki syntax stays text, typed links round-trip, Ctrl+click follows renamed targets");
  await page.keyboard.press("Control+Shift+l");
  const reference = page.getByRole("dialog", { name: "Add reference", exact: true });
  await reference.waitFor();
  assert.equal(await reference.getByRole("textbox").count(), 1);
  assert.equal(await reference.evaluate(el => el.matches(":modal")), true);
  await reference.getByLabel("URL", { exact: true }).fill("javascript:alert(1)");
  await reference.getByRole("button", { name: "Save reference", exact: true }).click();
  await reference.getByRole("alert").waitFor();
  await reference.getByLabel("URL", { exact: true }).fill("https://jira.corp/browse/OPS-42");
  await reference.locator(".reference-preview").getByText("OPS-42", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "reference.png") });
  await reference.getByRole("button", { name: "Save reference", exact: true }).click();
  await reference.waitFor({ state: "hidden" });
  const chip = page.locator(".reference-chip").filter({ hasText: "OPS-42" });
  await chip.waitFor();
  assert.deepEqual(await page.evaluate(() => window.workspaceTest.opened), []);
  await page.getByRole("button", { name: "Edit reference OPS-42", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit reference", exact: true });
  await edit.waitFor();
  assert.deepEqual(await page.evaluate(() => window.workspaceTest.opened), []);
  await page.keyboard.press("Escape"); await edit.waitFor({ state: "hidden" });
  await chip.click();
  assert.deepEqual(await page.evaluate(() => window.workspaceTest.opened), ["https://jira.corp/browse/OPS-42"]);
  await page.getByRole("button", { name: "Edit reference OPS-42", exact: true }).click();
  await edit.getByRole("button", { name: "Remove reference", exact: true }).click();
  assert.equal(await chip.count(), 0);
  console.log("PASS: reference validation, modal focus/Escape, separate edit/open, native opener and removal");

  await row("Renamed Beta").click(); await rich.getByRole("heading", { name: "Renamed Beta" }).waitFor();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search notes", exact: true });
  await search.waitFor();
  await search.getByRole("textbox").fill("bold words");
  await search.getByRole("button").filter({ hasText: "Alpha" }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "search.png") });
  await page.keyboard.press("Enter"); await search.waitFor({ state: "hidden" });
  await rich.getByRole("heading", { name: "Alpha" }).waitFor();
  await page.waitForFunction(() => getSelection()?.toString() === "bold words");
  console.log("PASS: search opens another note and reveals a match spanning bold markup");

  await page.getByRole("button", { name: "History and recovery", exact: true }).click();
  const history = page.getByRole("dialog", { name: "History and recovery", exact: true });
  await history.waitFor();
  assert.equal(await history.getByRole("button", { name: "This note", exact: true }).getAttribute("aria-pressed"), "true");
  await history.locator(".history-preview pre").waitFor();
  assert.doesNotMatch(await history.locator(".history-preview pre").innerText(), /# Keep this comment/);
  await page.screenshot({ path: resolve(artifacts, "history.png") });
  await history.getByRole("button", { name: "Restore version", exact: true }).click();
  await history.waitFor({ state: "hidden" });
  await rich.waitFor();
  const restored = await page.evaluate(() => window.workspaceTest.files.get("Vault A").get("a.md"));
  await mode.click(); assert.equal(await readSource(), restored);
  await mode.click();
  console.log("PASS: restoring the active note rebuilds its editor with the recovered content");

  await row("Renamed Beta").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Delete/ }).click();
  await row("Renamed Beta").waitFor({ state: "hidden" });
  await page.evaluate(() => window.workspaceTest.files.get("Vault A").set("b.md", "---\nnotes:\n  id: another-note-id\n  references: []\n---\n# Replacement\n\nKeep this content"));
  await page.getByRole("button", { name: "History and recovery", exact: true }).click();
  await history.waitFor();
  await history.getByRole("button", { name: "All notes", exact: true }).click();
  await history.locator(".history-list button").filter({ hasText: "Deleted" }).filter({ hasText: "b" }).first().click();
  await history.locator(".history-preview pre").waitFor();
  await history.getByRole("button", { name: "Restore version", exact: true }).click();
  await history.waitFor({ state: "hidden" });
  assert.match(await page.evaluate(() => window.workspaceTest.files.get("Vault A").get("b.md")), /Keep this content/);
  assert.ok(await page.evaluate(() => window.workspaceTest.files.get("Vault A").has("b-restored.md")));
  console.log("PASS: deleted-note recovery preserves a newer note with the same filename");

  await page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await rich.getByRole("heading", { name: "Other folder" }).waitFor();
  await page.keyboard.press("Control+k"); await search.waitFor();
  await search.getByRole("textbox").fill("Different");
  await search.getByRole("button").filter({ hasText: "Other folder" }).waitFor();
  await search.getByRole("textbox").fill("Alpha");
  await search.getByText("No matches", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "hidden" });
  console.log("PASS: switching vaults with the same filename refreshes the search index");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(artifacts, "workspace.png") });
  await writeFile(resolve(artifacts, "checks.json"), JSON.stringify({ passed: true, errors, checks: ["stable wiki links/backlinks", "save and YAML preservation", "references", "search reveal", "history/active restore", "deleted filename collision", "vault isolation"] }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, "failure.png") });
  console.error("Browser errors:", errors);
  throw error;
} finally { await browser.close(); }
