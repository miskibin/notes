# Notes

A local Markdown notebook built with Tauri and React. Notes are `.md` files in your chosen folder, with live preview, LaTeX math and embedded charts.

## Writing tools

- The footer shows save status, a word count, and autocomplete status. Click Autocomplete to toggle suggestions; Tab accepts one and Esc dismisses it. Autocomplete pauses in Markdown source mode.
- **Format Markdown** uses the Ollama edit model to organize the whole note into headings, paragraphs, lists and math. Review the rendered preview or Markdown source, then Apply formatting or Discard. Ctrl+Z undoes an applied format in one step. Formatting runs when you click it, and supports notes up to 24,000 Unicode characters.
- Select text and press **Ctrl+E** to edit a fragment with an instruction.
- Select an idea, right-click and choose **Visualize** (or **Ctrl+Alt+V**). The edit model writes a matplotlib chart using NumPy and SciPy. The chart is saved and inserted after the selection automatically. A narrow right sidebar shows progress and streamed model output; expand Details to inspect exact model requests/responses, Python code, errors and attempt timings, or copy the log. There is no chart modal or chat interface. Ctrl+Z undoes insertion; illustrative data is labeled. Desktop charts are PNG files in the vault's `assets/` folder.
- **Ctrl+Shift+M** switches between live preview and Markdown source; **Ctrl+K** searches notes.
- Click the space before or after a formula or chart to write beside it. Click a chart to select it, then press Delete or Backspace; Ctrl+Z restores it. At the start/end of adjacent text, Backspace/Delete first selects the object. Click a formula to edit its LaTeX; use a chart's Source button to edit its data.
- **Ctrl+K** opens a search dialog for titles, note bodies and reference labels/URLs. Arrow keys select a result; Enter opens it and selects the matching text when present in the document. An empty query shows recently opened notes from this session.
- **Ctrl+Shift+L** adds a local reference to a web page, Jira issue, GitHub/Gerrit change or Teams link. Paste the URL to preview its automatic label, then save; no description field. Use its pencil button to change the link or remove it. Existing custom labels are preserved when the URL stays the same. References are stored in Markdown YAML; adding one makes no network request.
- Write `[[Note title]]` to link notes. Ctrl+click the link or click its reference chip to open the target; stable IDs keep existing links working after a title change. Linking notes appear above the target document.
- **History and recovery** starts with snapshots of the current note; All notes also includes deleted notes. Select a dated version to preview its Markdown body, title, word/line counts and word-count difference from the current note before restoring it. Current content is archived before restoring. The latest 200 snapshots are kept per vault in `.notes-history/`; recovering a deleted note preserves a newer, different note with the same filename.

Window controls remain in the top-right corner during navigation, menus and dialogs. Native dragging is restricted to blank title regions; the shared resize rail releases pointer capture on blur, Escape, cancellation and lost capture. Settings → Appearance → Experimental offers **Frosted glass**, disabled by default. It uses Windows Acrylic with opaque text and a solid fallback if native effects are unavailable; toggling off restores opaque surfaces and the window shadow. Other platforms and the browser stay opaque.

Configure the Ollama address, autocomplete model and edit model in Settings → Notes. Formatting and Visualize use the edit model. Models must already be available on the configured server. Failed or incomplete responses leave the original unchanged.

Scientific Python runs in a disposable WebAssembly worker with its own virtual filesystem. Host Python is never executed. Imports and operations are restricted to plotting and numerical work, network channels are disabled during execution, and computation is terminated after 20 seconds or on cancellation. Visualize supports selections up to 12,000 characters and produces one figure, including subplots, diagrams and 3D plots.

### Chart agent

The chart agent is a small TypeScript loop with one tool (`renderPythonChart`) and at most three model calls. JSON/validation/Python failures return the preceding response and the actual error to the model for correction. Transport failures stop immediately. The original selection is checked again before insertion; editing the note during generation never overwrites the new text. Cancel terminates the Python worker and prevents late results, insertion or further repairs. Cancellation also drops the native Ollama HTTP request. Model generation streams for up to 10 minutes (connection timeout: 5 seconds); timeout, HTTP and connection errors are reported separately.

The trace stays in memory until dismissed or navigation starts. It records observable requests and tool activity, not hidden model reasoning. Copy log includes the selected text, prompts, output and errors. No telemetry or agent server is added.

[LangChain's tool-error pattern](https://docs.langchain.com/oss/javascript/langchain/tools) and [Pydantic AI retries](https://pydantic.dev/docs/ai/core-concepts/retries/) were considered. For one bounded plotting tool, a local loop provides the needed feedback without adding a framework or Python service. The activity indicator is vendored from [chat-components](https://github.com/miskibin/chat-components/blob/main/components/ui/generation-status.tsx); its larger message/tool renderer is unnecessary here.

## Development

Install dependencies with `npm install`. For the desktop app, install Rust and the Tauri Windows build prerequisites, then run `npm run tauri dev`.

`npm run dev` opens a browser preview. Its note vault is temporary and lasts only for that page session; desktop notes are stored on disk.

`npm run dev` and `npm run build` prepare a pinned Pyodide runtime and scientific packages in `public/python/`. The first setup downloads packages with SHA-256 verification; later runs reuse the local cache. These files are bundled with the desktop app, so chart execution requires no CDN connection. Run `npm run setup:python` to prepare them separately.

## Validation

```powershell
npm test
npm run test:python
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --no-bundle
```

The desktop build is written to `src-tauri/target/debug/notes.exe`.

Browser regression scripts use an isolated temporary vault. Install Playwright outside the app or set `PLAYWRIGHT_MODULE` to its import path (and optionally `CHROMIUM_EXECUTABLE` for the two workspace/visualize smoke scripts), start the dev server, then run:

```powershell
node scripts/polish-smoke.mjs
node scripts/visualize-smoke.mjs
node scripts/storage-smoke.mjs
node scripts/workspace-smoke.mjs
node scripts/context-menu-smoke.mjs
node scripts/editor-smoke.mjs
node scripts/rendered-navigation-smoke.mjs
node scripts/redesign-smoke.mjs
```

`polish-smoke.mjs` mocks Ollama to verify formatting, undo, cancellation, errors and autocomplete states without running model jobs. Screenshots and results are in `artifacts/polish/`.

`visualize-smoke.mjs` mocks the model response but executes the real scientific Python worker, then checks automatic source/rich insertion, undo, the inspectable trace, error-driven repairs, the attempt limit, cancellation and stale-selection protection. `test:python` additionally checks restricted operations and renders SciPy, 3D and diagram examples. Real model output quality depends on the selected Ollama model.

`storage-smoke.mjs` uses a delayed in-memory Tauri bridge to exercise navigation, folder changes, save failures and closing order without touching desktop files. `context-menu-smoke.mjs` checks clipboard actions and undo in both editors.

`workspace-smoke.mjs` verifies references, stable note links and backlinks, YAML preservation, search selection, history restoration and folder isolation with a delayed in-memory Tauri bridge.

`window-smoke.mjs` checks window-control hit targets during transitions, all four modal top layers and context menus. It also exercises interrupted capture in an isolated resize-rail harness and the Windows effect bridge, including opaque fallback. Native commands are mocked; actual Acrylic and interaction with other Windows applications require desktop verification.
