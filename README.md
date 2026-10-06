# Notes

A local Markdown notebook built with Tauri and React. Notes are `.md` files in your chosen folder, with live preview, LaTeX math and embedded charts.

Download the [Windows x64 installer](https://github.com/miskibin/notes/releases/latest). Releases include the scientific Python runtime and a SHA-256 checksum. Local Ollama models are configured separately in Settings → Notes.

## Writing tools

- The footer shows save status, a word count, and autocomplete status. Click Autocomplete to toggle suggestions; Tab accepts one and Esc dismisses it. Autocomplete pauses in Markdown source mode.
- Suggestions start after a short typing pause, including unfinished words, and stream complete words as they arrive. Typing the suggested prefix keeps the remaining suggestion. Moving the caret, changing models, leaving the editor or pressing Esc cancels the outstanding Ollama request; recent results are reused within the current editor. Formula source and code never trigger suggestions.
- **Format Markdown** opens a mode chooser without sending the note. **Structure only** classifies short plain-text fragments with a separate decision model and inserts Markdown markers without rewriting content. **Generative** keeps the existing edit-model formatter (including math conversion, up to 24,000 Unicode characters). Click Generate preview, review the proposed changes or Markdown, then Apply formatting or Discard. Ctrl+Z undoes the entire operation.
- Select text and press **Ctrl+E** to edit a fragment with an instruction.
- Select an idea, right-click and choose **Visualize** (or **Ctrl+Alt+V**). The edit model writes a matplotlib chart using NumPy and SciPy. The chart is saved and inserted after the selection automatically. A narrow right sidebar shows progress and streamed model output; expand Details to inspect exact model requests/responses, Python code, errors and attempt timings, or copy the log. There is no chart modal or chat interface. Ctrl+Z undoes insertion; illustrative data is labeled. Desktop charts are PNG files in the vault's `assets/` folder.
- **Ctrl+Shift+M** switches between live preview and Markdown source; **Ctrl+K** searches notes.
- Pasting ChatGPT formulas automatically converts `\(…\)` to `$…$` and `\[…\]` to fenced `$$` blocks in both editors, including doubled delimiter backslashes. LaTeX commands stay intact; code, link URLs and existing dollar formulas stay literal. Markdown markers remain visible with reduced opacity.
- Click the space before or after a formula or chart to write beside it. Click a chart to select it, then press Delete or Backspace; Ctrl+Z restores it. At the start/end of adjacent text, Backspace/Delete first selects the object. Click a formula to edit its LaTeX; use a chart's Source button to edit its data.
- **Ctrl+K** opens a search dialog for titles, note bodies and reference labels/URLs. Arrow keys select a result; Enter opens it and selects the matching text when present in the document. An empty query shows recently opened notes from this session.
- **Ctrl+Shift+L** adds a local reference to a web page, Jira issue, GitHub/Gerrit change or Teams link. Paste the URL to preview its automatic label, then save; no description field. Use its pencil button to change the link or remove it. Existing custom labels are preserved when the URL stays the same. References are stored in Markdown YAML; adding one makes no network request.
- Write `[[Note title]]` to link notes. Ctrl+click the link or click its reference chip to open the target; stable IDs keep existing links working after a title change. Linking notes appear above the target document.
- **History and recovery** starts with snapshots of the current note; All notes also includes deleted notes. Select a dated version to preview its Markdown body, title, word/line counts and word-count difference from the current note before restoring it. Current content is archived before restoring. The latest 200 snapshots are kept per vault in `.notes-history/`; recovering a deleted note preserves a newer, different note with the same filename.

Window controls remain in the top-right corner during navigation, menus and dialogs. Native dragging is restricted to blank title regions; the shared resize rail releases pointer capture on blur, Escape, cancellation and lost capture. The frosted-glass experiment was removed from Settings and previously enabled settings migrate to opaque surfaces. Settings → Appearance → Editor has a **Markdown markers** opacity slider (15–100%, default 55%), shared by the source and live editors.

Configure the Ollama address, autocomplete model, edit model and independent decision model in Settings → Notes. Generative formatting and Visualize use the edit model. Models must already be available on the configured server. Failed or incomplete responses leave the original unchanged.

Scientific Python runs in a disposable WebAssembly worker with its own virtual filesystem. Host Python is never executed. Imports and operations are restricted to plotting and numerical work, network channels are disabled during execution, and computation is terminated after 20 seconds or on cancellation. Visualize supports selections up to 12,000 characters and produces one figure, including subplots, diagrams and 3D plots.

### Structure only

Requires **Ollama >= 0.35** and compatible **GGUF** decision weights. Default candidate: `tev1:0.8b-q8_0`; manually selectable alternative: `tev1:4b-q4_K_M`. Install one yourself; there are no model downloads, bundled weights, cloud fallback, chat or agent framework:

```sh
ollama pull tev1:0.8b-q8_0
# Optional alternative:
ollama pull tev1:4b-q4_K_M
```

Choose Format Markdown → Structure only → Generate preview. The selected model and exact configured server address appear before submission, including explicitly configured remote servers. Each run first sends a synthetic compatibility probe with no note data. The browser and native desktop transport use only `POST /v1/systemone` with `model`, `state`, `questions` and `keep_alive`. A `choice` question maps `keep`, `heading_2`, `heading_3`, `bullet_item` to explicit criteria. The model supplies no source positions, edits or generated Markdown. Redirects are refused. Native cancellation aborts the HTTP task, including model loading; a started handshake closes the cancellation/registration race. Generative formatting now also supports native cancellation.

The unified/remark parser (GFM, math, YAML/TOML) provides exact UTF-16 source offsets. Only top-level paragraphs containing literal plain-text children are candidates. Existing headings/lists, nested lists, front matter, code/chart fences, math, HTML, tables, links/images/wiki-links and ambiguous or mixed blocks remain opaque. Unclosed front matter/display math protects the entire note. A short standalone label needs subsequent prose before it can become H2; H3 additionally requires an existing H2 context. Sentence-ending punctuation blocks heading promotion. Bullets require a multiline group whose **every** member is classified as a bullet; isolated prose and partial groups stay unchanged. Headings mixed into multiline paragraphs are conservatively skipped in this first version. No whole-document AST serialization is used to apply the patch.

Only `## `, `### ` or `- ` may be inserted at parser-verified line starts; no original character is removed, replaced or reordered. The hard invariant removes exactly the planned insertions and compares the original character for character, additionally checking protected ranges. It runs before Apply, against the actual editor source after Apply, and against the saved file read back from the vault. Both editors retain exact source at formatting/Undo boundaries, including CRLF. Changing document content, note, vault, host or model invalidates a preview. A failed classification never automatically applies a partial result.

One request runs at a time, with a 60-second per-request timeout. No classification occurs while typing. Fragments are limited to 480 UTF-8 bytes and neighbor context to 96 bytes each; protected neighbors are omitted. The **whole JSON request**, including question/criteria overhead, is limited to 1,800 UTF-8 bytes as a conservative byte/token proxy with space for runner overhead below Tev1's practical ~2,000-token context. Oversized indivisible paragraphs/groups are skipped. A memory-only LRU holds 128 valid decisions, keyed by host, model, fragment, neighboring context, H2 context and criteria version; synthetic probes are never cached.

Unknown labels, malformed question answers and uncertain distributions mean `keep`. The provisional policy requires an option score >= 0.93 and a margin >= 0.85; `confidence` is ignored and **neither score nor confidence is treated as calibrated correctness**. Deterministic tests verify abstention and patch safety; they cannot establish model quality. The 0.8B candidate has **not** been accepted as sufficient without a real evaluation. Connection, unsupported endpoint, missing/incompatible model, timeout, context and invalid-response errors have separate messages; missing-model errors show the exact pull command.

[System One contract](https://docs.ollama.com/api/systemone) and [Tev1 model notes](https://ollama.com/library/tev1) were checked on 2026-10-06. Tev1's metadata context is not a safe working budget, and its multilingual/prompt-injection calibration is not established by the model documentation.

There are 12 separate tuning examples and **44 held-out evaluation examples** (PL, EN and mixed; 32 `keep`) in `examples/structure/`. Do not adjust criteria using the held-out set. Node 24's built-in TypeScript stripping runs the optional real-Ollama benchmark using the exact application criteria and validator:

```sh
npm run benchmark:structure -- --host http://127.0.0.1:11434 --repeats 3
# Only the tuning set may inform criteria changes:
npm run benchmark:structure -- --split tuning --repeats 1 --out artifacts/structure-tuning.json
```

The script compares both explicit GGUF tags, reports raw category accuracy, policy accuracy, precision of non-keep proposals, abstention, invalid answers, first-call latency and warm p50/p95, and saves per-example decisions with model metadata and criteria version. First-call latency includes loading only if the model was not already loaded; the script does not unload someone else's models. It makes real uncached API calls, not mocked quality measurements. Failed/missing servers or models produce no fabricated report. To run integration tests against an existing `npm run dev` server:

```sh
CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/structure-smoke.mjs
CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/polish-smoke.mjs
CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/window-smoke.mjs
```

Install Playwright separately for smoke tests (or set `PLAYWRIGHT_MODULE` to its absolute module path). `structure-smoke` exercises the actual App and both editors with an isolated native bridge mock, exact source/disk preservation, Apply/Discard/Undo/Redo, errors, cancellation and late replies, and content/note/vault invalidation. These are integration tests, **not a model benchmark**.

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

Browser regression scripts use an isolated temporary vault. Install Playwright outside the app or set `PLAYWRIGHT_MODULE` to its import path (and optionally `CHROMIUM_EXECUTABLE` for scripts that support it), start the dev server, then run:

```powershell
node scripts/polish-smoke.mjs
node scripts/visualize-smoke.mjs
node scripts/storage-smoke.mjs
node scripts/workspace-smoke.mjs
node scripts/context-menu-smoke.mjs
node scripts/editor-smoke.mjs
node scripts/math-paste-smoke.mjs
node scripts/editor-reliability-smoke.mjs
node scripts/rendered-navigation-smoke.mjs
node scripts/redesign-smoke.mjs
```

`polish-smoke.mjs` mocks Ollama to verify formatting, undo, cancellation, errors and autocomplete states without running model jobs. Screenshots and results are in `artifacts/polish/`.

`editor-reliability-smoke.mjs` uses a local delayed Ollama stream to check early suggestions, prefix reuse, Tab/Esc and actual request disconnection. It also covers display-math closing fences, preservation of trailing text, escaped dollars and writing between adjacent formulas. It does not measure real model inference speed.

`visualize-smoke.mjs` mocks the model response but executes the real scientific Python worker, then checks automatic source/rich insertion, undo, the inspectable trace, error-driven repairs, the attempt limit, cancellation and stale-selection protection. `test:python` additionally checks restricted operations and renders SciPy, 3D and diagram examples. Real model output quality depends on the selected Ollama model.

`storage-smoke.mjs` uses a delayed in-memory Tauri bridge to exercise navigation, folder changes, save failures and closing order without touching desktop files. `context-menu-smoke.mjs` checks clipboard actions and undo in both editors.

`workspace-smoke.mjs` verifies references, stable note links and backlinks, YAML preservation, search selection, history restoration and folder isolation with a delayed in-memory Tauri bridge.

`window-smoke.mjs` checks window-control hit targets during transitions, all four modal top layers and context menus. It also exercises interrupted capture in an isolated resize-rail harness and the Windows effect bridge, including opaque fallback. Native commands are mocked; actual Acrylic and interaction with other Windows applications require desktop verification.
