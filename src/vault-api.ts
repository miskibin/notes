import { CHART_TIMEOUT_MS, CHART_TIMEOUT_MESSAGE, readChartStream } from "./visualize/stream";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WELCOME_NOTE, countLines, titleFrom, type NoteFile } from "./notes";
import { FORMAT_SYSTEM, cleanFormattedNote, validateFormatInput } from "./formatting";
import visualizePrompt from "./visualize/prompt.txt?raw";
import { parseRecipe, validateIdea, type ChartRecipe } from "./visualize/recipe";
import { completionRequest, readCompletionStream } from "./editor/completion-stream";

export type CompletionResult = {
  text: string;
  truncated: boolean;
};

const memoryNotes = new Map<string, string>();
const memoryModified = new Map<string, number>();
const assetCache = new Map<string, string>();
const memoryHistory: HistoryEntry[] = [];
const memoryHistoryBodies = new Map<string, string>();

export type HistoryEntry = { id: string; note: string; modified_ms: number; deleted: boolean };

export function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function ensureBrowserVault(): void {
  if (!memoryNotes.has("welcome.md")) {
    memoryNotes.set("welcome.md", WELCOME_NOTE);
    memoryModified.set("welcome.md", Date.now());
  }
}

export async function defaultVaultDir(): Promise<string> {
  if (!isTauri()) return "Browser notes";
  return invoke<string>("default_vault_dir");
}

export async function pickVaultDir(): Promise<string | null> {
  if (!isTauri()) return null;
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Notes folder",
  });
  return typeof picked === "string" ? picked : null;
}

export async function listNotes(vault: string): Promise<NoteFile[]> {
  if (!isTauri()) {
    ensureBrowserVault();
    return [...memoryNotes.entries()]
      .map(([name, body]) => ({
        name,
        title: titleFrom(body, name),
        modified_ms: memoryModified.get(name) ?? 0,
        line_count: countLines(body),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  return invoke<NoteFile[]>("list_notes", { vault });
}

export async function readNote(vault: string, name: string): Promise<string> {
  if (!isTauri()) {
    ensureBrowserVault();
    const body = memoryNotes.get(name);
    if (body == null) throw new Error("Note not found");
    return body;
  }
  return invoke<string>("read_note", { vault, name });
}

export async function writeNote(vault: string, name: string, body: string): Promise<void> {
  if (!isTauri()) {
    const previous = memoryNotes.get(name);
    if (previous != null && previous !== body) archiveMemory(name, previous, false);
    memoryNotes.set(name, body);
    memoryModified.set(name, Date.now());
    return;
  }
  await invoke("write_note", { vault, name, body });
}

export async function deleteNote(vault: string, name: string): Promise<void> {
  if (!isTauri()) {
    const previous = memoryNotes.get(name);
    if (previous != null) archiveMemory(name, previous, true);
    memoryNotes.delete(name);
    memoryModified.delete(name);
    return;
  }
  await invoke("delete_note", { vault, name });
}

export async function listHistory(vault: string): Promise<HistoryEntry[]> {
  if (!isTauri()) return [...memoryHistory].sort((a, b) => b.modified_ms - a.modified_ms);
  return invoke<HistoryEntry[]>("list_history", { vault });
}

export async function readHistory(vault: string, id: string): Promise<string> {
  if (!isTauri()) {
    const body = memoryHistoryBodies.get(id);
    if (body == null) throw new Error("History entry not found");
    return body;
  }
  return invoke<string>("read_history", { vault, id });
}

function archiveMemory(note: string, body: string, deleted: boolean): void {
  const modified_ms = Date.now();
  const id = `${modified_ms}-${deleted ? "deleted" : "version"}-${note}-${crypto.randomUUID()}`;
  memoryHistory.unshift({ id, note, modified_ms, deleted });
  memoryHistoryBodies.set(id, body);
  while (memoryHistory.length > 200) memoryHistoryBodies.delete(memoryHistory.pop()!.id);
}

export async function ensureWelcome(vault: string): Promise<void> {
  const notes = await listNotes(vault);
  if (notes.length > 0) return;
  await writeNote(vault, "welcome.md", WELCOME_NOTE);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image"));
    reader.readAsDataURL(file);
  });
}

export async function saveImage(vault: string, file: File): Promise<string> {
  const ext = extensionOf(file);
  if (!isTauri()) {
    const data = await fileToBase64(file);
    return `data:${file.type || "image/png"};base64,${data}`;
  }
  const dataBase64 = await fileToBase64(file);
  return invoke<string>("save_image", { vault, dataBase64, ext });
}

export async function displayUrl(vault: string, src: string): Promise<string> {
  if (!src.startsWith("assets/")) return src;
  const key = `${vault}\0${src}`;
  const cached = assetCache.get(key);
  if (cached) return cached;
  if (!isTauri()) return src;
  const data = await invoke<string>("read_asset", { vault, relative: src });
  const url = `data:${mimeFor(src)};base64,${data}`;
  assetCache.set(key, url);
  return url;
}

export async function listModels(host: string): Promise<string[]> {
  if (!isTauri()) return listModelsOverHttp(host);
  return invoke<string[]>("list_models", { host });
}

export async function completeLine(host: string, model: string, line: string, signal?: AbortSignal, onProgress?: (text: string) => void): Promise<CompletionResult> {
  signal?.throwIfAborted();
  if (!isTauri()) return completeOverHttp(host, model, line, signal, onProgress);
  const requestId = crypto.randomUUID();
  const cancel = () => { void invoke("cancel_completion", { requestId }).catch(() => {}); };
  let active = true;
  const onEvent = new Channel<{ text?: string; started?: boolean }>();
  onEvent.onmessage = (event) => {
    if (!active) return;
    // Cancellation may have arrived before Rust registered the request.
    if (signal?.aborted) { if (event.started) cancel(); return; }
    if (event.text) onProgress?.(event.text);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = await invoke<CompletionResult>("complete_line", { host, model, line, requestId, onEvent });
    signal?.throwIfAborted();
    return result;
  } catch (error) { signal?.throwIfAborted(); throw error; }
  finally { active = false; signal?.removeEventListener("abort", cancel); }
}

const EDIT_SYSTEM =
  "You edit a selected fragment of a note. Apply the instruction to that fragment and return only the replacement text. Keep the original language unless the instruction asks for a translation. Do not add a title, quotes, code fences, or any explanation.";

export async function editSelection(
  host: string,
  model: string,
  instruction: string,
  text: string,
): Promise<string> {
  if (!model.trim()) throw new Error("Pick an edit model in Settings.");
  if (!isTauri()) return editOverHttp(host, model, instruction, text);
  return invoke<string>("edit_selection", { host, model, instruction, text });
}

export async function formatNote(host: string, model: string, text: string, signal?: AbortSignal): Promise<string> {
  validateFormatInput(text);
  if (!model.trim()) throw new Error("Choose an edit model in Settings to format notes.");
  if (isTauri()) {
    return cleanFormattedNote(await invoke<string>("format_note", { host, model, text }));
  }
  const response = await fetch(`${host.trim().replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model, stream: false, think: false, keep_alive: "30m",
      messages: [
        { role: "system", content: FORMAT_SYSTEM },
        { role: "user", content: `Format this note:\n\n${text}` },
      ],
      options: { temperature: 0.1, num_predict: Math.min(16_384, Math.max(1024, Array.from(text).length + 512)) },
    }),
  });
  const body = await response.json() as { message?: { content?: string }; done_reason?: string; error?: string };
  if (!response.ok || body.error) throw new Error(body.error || "Ollama request failed. Check the address and edit model in Settings.");
  if (body.done_reason === "length") throw new Error("The model stopped before finishing. Try a shorter note or another edit model.");
  return cleanFormattedNote(body.message?.content ?? "");
}

export type ChartRepair = { previousResponse: string; error: string };

export function chartRequest(model: string, text: string, repair?: ChartRepair) {
  const messages = [{ role: "system", content: visualizePrompt }, { role: "user", content: `Visualize this idea:\n\n${text}` }];
  if (repair) messages.push(
    { role: "assistant", content: repair.previousResponse },
    { role: "user", content: `The chart failed validation or Python execution:\n${repair.error}\n\nFix the error and return the complete chart JSON. Keep the original idea, data and assumptions. Follow the plotting restrictions.` },
  );
  return { model, stream: true, think: false, format: "json", keep_alive: "30m", messages,
    options: { temperature: 0.2, num_predict: 8192 } };
}

export async function requestChart(host: string, model: string, text: string, signal: AbortSignal, repair?: ChartRepair, onProgress?: (text: string) => void): Promise<string> {
  validateIdea(text);
  if (!model.trim()) throw new Error("Choose an edit model in Settings to visualize ideas.");
  signal.throwIfAborted();
  if (isTauri()) {
    const requestId = crypto.randomUUID();
    const cancel = () => { void invoke("cancel_visualize", { requestId }).catch(() => {}); };
    let active = true;
    const onEvent = new Channel<{ content?: string; started?: boolean }>();
    onEvent.onmessage = event => {
      if (!active) return;
      if (signal.aborted) { if (event.started) cancel(); return; }
      if (event.content) onProgress?.(event.content);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const raw = await invoke<string>("visualize_selection", { host, model, text, requestId, onEvent,
        previousResponse: repair?.previousResponse ?? null, repairError: repair?.error ?? null });
      signal.throwIfAborted();
      return raw;
    } catch (error) { signal.throwIfAborted(); throw error; }
    finally { active = false; signal.removeEventListener("abort", cancel); }
  }
  const timeout = AbortSignal.timeout(CHART_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    const response = await fetch(`${host.trim().replace(/\/+$/, "")}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: combined,
      body: JSON.stringify(chartRequest(model, text, repair)),
    });
    return await readChartStream(response, combined, onProgress);
  } catch (error) {
    signal.throwIfAborted();
    if (timeout.aborted) throw new Error(CHART_TIMEOUT_MESSAGE);
    if (error instanceof TypeError) throw new Error(`Cannot reach Ollama at ${host}. Check the address and browser CORS settings. ${error.message}`);
    throw error;
  }
}

export async function visualizeIdea(host: string, model: string, text: string, signal: AbortSignal): Promise<ChartRecipe> {
  return parseRecipe(await requestChart(host, model, text, signal));
}

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(fromName)) return fromName;
  const fromType = file.type.split("/")[1]?.toLowerCase() ?? "";
  if (fromType === "jpeg") return "jpg";
  if (fromType === "svg+xml") return "svg";
  return fromType || "png";
}

function mimeFor(src: string): string {
  const ext = src.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

async function listModelsOverHttp(host: string): Promise<string[]> {
  const response = await fetch(`${host.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Ollama is not running at that address.");
  const body = (await response.json()) as { models?: { name?: string }[] };
  return (body.models ?? [])
    .map((model) => model.name ?? "")
    .filter((name) => name.length > 0)
    .sort();
}

async function editOverHttp(host: string, model: string, instruction: string, text: string): Promise<string> {
  const response = await fetch(`${host.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      keep_alive: "30m",
      messages: [
        { role: "system", content: EDIT_SYSTEM },
        { role: "user", content: `Instruction:\n${instruction.trim()}\n\nSelected text:\n${text}` },
      ],
      options: { temperature: 0.3, num_predict: Math.min(4096, Math.max(192, Math.ceil(text.length / 3) + 64)) },
    }),
  });
  const body = (await response.json()) as {
    message?: { content?: string };
    done_reason?: string;
    error?: string;
  };
  if (!response.ok || body.error) throw new Error(body.error || "Ollama request failed");
  if (body.done_reason === "length") throw new Error("The model stopped early. Select a shorter fragment.");
  const content = body.message?.content ?? "";
  if (!content.trim()) throw new Error("The model returned nothing.");
  return content;
}

async function completeOverHttp(host: string, model: string, line: string, signal?: AbortSignal, onProgress?: (text: string) => void): Promise<CompletionResult> {
  const timeout = AbortSignal.timeout(30_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`${host.trim().replace(/\/+$/, "")}/api/generate`, {
    method: "POST",
    signal: combined,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(completionRequest(model, line)),
  });
  return readCompletionStream(response, combined, onProgress);
}
