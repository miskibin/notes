import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
// Exercise the real Tauri frontend API against an isolated, delayed in-memory IPC bridge.
// This never opens or modifies the user's desktop vault.
await page.addInitScript(() => {
  const callbacks = new Map(), listeners = new Map();
  let next = 0;
  const files = new Map([["Vault A", new Map([["a.md", "# Alpha\n\nOriginal A"], ["b.md", "# Beta\n\nOriginal B"]])],
    ["Vault B", new Map([["a.md", "# Other folder\n\nDifferent content"]])]]);
  const state = window.storageTest = { files, log: [], fail: false, failRead: false, destroyed: 0,
    close: async () => { for (const [id, listener] of listeners) if (listener.event === "tauri://close-requested") await callbacks.get(listener.handler)?.({ event: listener.event, id, payload: null }); } };
  localStorage.setItem("notes-settings", JSON.stringify({ appearanceRev: 2, vault: "Vault A", autocomplete: false }));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => listeners.delete(id) };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" } },
    transformCallback: callback => { const id = ++next; callbacks.set(id, callback); return id; },
    invoke: async (command, args) => {
      if (command === "plugin:event|listen") { const id = ++next; listeners.set(id, args); return id; }
      if (command === "plugin:event|unlisten") return;
      if (command === "plugin:window|close") return state.close();
      if (command === "plugin:window|destroy") { state.log.push("destroy"); state.destroyed++; return; }
      if (command === "plugin:dialog|open") return "Vault B";
      if (command === "list_models") return [];
      const vault = files.get(args.vault);
      if (command === "list_notes") return [...vault].map(([name, body]) => ({ name, title: body.match(/^# (.*)/)?.[1] || name, modified_ms: 0, line_count: 3 }));
      if (command === "read_note") { await new Promise(resolve => setTimeout(resolve, 200)); if (state.failRead) throw new Error("Simulated read failure"); return vault.get(args.name); }
      if (command === "write_note") {
        state.log.push(`start:${args.name}`);
        await new Promise(resolve => setTimeout(resolve, 80));
        if (state.fail) throw new Error("Simulated disk failure");
        vault.set(args.name, args.body); state.log.push(`saved:${args.name}`); return;
      }
      throw new Error(`Unexpected test command: ${command}`);
    },
  };
});
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:1420");
  const editor = page.locator('.note-scroll .ProseMirror[contenteditable="true"]');
  const sourceButton = page.getByRole("button", { name: "Markdown source", exact: true });
  const source = page.locator(".cm-content");
  const row = title => page.locator('[data-slot="sidebar-item-button"]').filter({ hasText: title });
  await editor.waitFor(); await sourceButton.click(); await source.click();
  await page.keyboard.press("Control+a"); await page.keyboard.insertText("# Alpha\n\nEdited before changing notes");
  await row("Beta").click();
  await row("Alpha").evaluate(el => el.click()); // A competing navigation arrives during the read.
  await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.includes("Original B"));
  await row("Alpha").click();
  await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.includes("Edited before changing"));
  assert.match(await page.evaluate(() => window.storageTest.files.get("Vault A").get("a.md")), /Edited before changing/);

  const newNote = page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "New note", exact: true });
  await newNote.evaluate(el => { el.click(); el.click(); });
  await page.waitForFunction(() => window.storageTest.files.get("Vault A").get("untitled.md")?.replace(/^---\n[\s\S]*?\n---\n/, "") === "");
  assert.equal(await page.evaluate(() => window.storageTest.files.get("Vault A").size), 3);
  await row("Alpha").click();
  await page.waitForFunction(() => document.querySelector(".cm-content")?.textContent.includes("Edited before changing"));

  await sourceButton.click(); await editor.waitFor();
  await page.locator('[data-slot="chat-sidebar-panel"]').getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.evaluate(() => { window.storageTest.failRead = true; });
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByText("Simulated read failure", { exact: true }).waitFor();
  // Background indexing can report the same injected failure before the folder
  // transition finishes. Keep the failure active until that transition settles.
  await page.locator('.app-body[aria-busy="false"]').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("notes-settings")).vault), "Vault A");
  await page.evaluate(() => { window.storageTest.failRead = false; });
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".note-scroll .ProseMirror")?.textContent.includes("Different content"));
  assert.doesNotMatch(await editor.innerText(), /Edited before changing/);

  await sourceButton.click(); await source.click(); await page.keyboard.press("Control+a");
  await page.keyboard.insertText("# Close test\n\nUnsaved final text");
  await page.evaluate(() => { window.storageTest.fail = true; void window.storageTest.close(); });
  await page.getByText("Simulated disk failure", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.storageTest.destroyed), 0);
  await page.evaluate(() => { window.storageTest.fail = false; void window.storageTest.close(); });
  await page.waitForFunction(() => window.storageTest.destroyed === 1);
  assert.match(await page.evaluate(() => window.storageTest.files.get("Vault B").get("a.md")), /Unsaved final text/);
  const log = await page.evaluate(() => window.storageTest.log);
  assert.equal(log.at(-2), "saved:a.md"); assert.equal(log.at(-1), "destroy");
  assert.deepEqual(errors, []);
  console.log("PASS: delayed save/navigation, concurrent create, folder switch with same filename, failed close preserves window, save precedes native destroy");
} finally { await browser.close(); }
