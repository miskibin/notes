# Notes

A local Markdown notebook built with Tauri and React. Notes are `.md` files in your chosen folder, with live preview, LaTeX math and embedded charts.

## Writing tools

- The footer shows save status, a word count, and autocomplete status. Click Autocomplete to toggle suggestions; Tab accepts one and Esc dismisses it. Autocomplete pauses in Markdown source mode.
- **Format Markdown** uses the Ollama edit model to organize the whole note into headings, paragraphs, lists and math. Review the rendered preview or Markdown source, then Apply formatting or Discard. Ctrl+Z undoes an applied format in one step. Formatting runs when you click it, and supports notes up to 24,000 Unicode characters.
- Select text and press **Ctrl+E** to edit a fragment with an instruction.
- Select an idea, right-click and choose **Visualize** (or **Ctrl+Alt+V**). The edit model writes a matplotlib chart using NumPy and SciPy. Review the chart, caption and Python source, then insert it after the selection. Ctrl+Z undoes insertion; illustrative data is labeled. Desktop charts are PNG files in the vault's `assets/` folder.
- **Ctrl+Shift+M** switches between live preview and Markdown source; **Ctrl+K** searches notes.

Configure the Ollama address, autocomplete model and edit model in Settings → Notes. Formatting and Visualize use the edit model. Models must already be available on the configured server. Failed or incomplete responses leave the original unchanged.

Scientific Python runs in a disposable WebAssembly worker with its own virtual filesystem. Host Python is never executed. Imports and operations are restricted to plotting and numerical work, network channels are disabled during execution, and computation is terminated after 20 seconds or on cancellation. Visualize supports selections up to 12,000 characters and produces one figure, including subplots, diagrams and 3D plots.

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

Browser regression scripts use an isolated temporary vault. Install Playwright outside the app or set `PLAYWRIGHT_MODULE` to its import path, start the dev server, then run:

```powershell
node scripts/polish-smoke.mjs
node scripts/visualize-smoke.mjs
node scripts/storage-smoke.mjs
node scripts/context-menu-smoke.mjs
node scripts/editor-smoke.mjs
node scripts/redesign-smoke.mjs
```

`polish-smoke.mjs` mocks Ollama to verify formatting, undo, cancellation, errors and autocomplete states without running model jobs. Screenshots and results are in `artifacts/polish/`.

`visualize-smoke.mjs` mocks the model response but executes the real scientific Python worker, then checks previews, insertion, undo, errors and cancellation. `test:python` additionally checks restricted operations and renders SciPy, 3D and diagram examples. Real model output quality depends on the selected Ollama model.

`storage-smoke.mjs` uses a delayed in-memory Tauri bridge to exercise navigation, folder changes, save failures and closing order without touching desktop files. `context-menu-smoke.mjs` checks clipboard actions and undo in both editors.
