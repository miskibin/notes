import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WELCOME_NOTE, titleFrom, type NoteFile } from "./notes";

export type CompletionResult = {
  text: string;
  truncated: boolean;
};

const memoryNotes = new Map<string, string>();
const assetCache = new Map<string, string>();

export function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function ensureBrowserVault(): void {
  if (!memoryNotes.has("welcome.md")) memoryNotes.set("welcome.md", WELCOME_NOTE);
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
        modified_ms: 0,
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
    memoryNotes.set(name, body);
    return;
  }
  await invoke("write_note", { vault, name, body });
}

export async function deleteNote(vault: string, name: string): Promise<void> {
  if (!isTauri()) {
    memoryNotes.delete(name);
    return;
  }
  await invoke("delete_note", { vault, name });
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

export async function completeLine(host: string, model: string, line: string): Promise<CompletionResult> {
  if (!isTauri()) return completeOverHttp(host, model, line);
  return invoke<CompletionResult>("complete_line", { host, model, line });
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
  const response = await fetch(`${host.replace(/\/$/, "")}/api/tags`);
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

async function completeOverHttp(host: string, model: string, line: string): Promise<CompletionResult> {
  const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: line,
      stream: false,
      raw: true,
      think: false,
      keep_alive: "30m",
      options: { num_predict: 16, temperature: 0.2, top_p: 0.9, repeat_penalty: 1.08 },
    }),
  });
  const body = (await response.json()) as { response?: string; done_reason?: string; error?: string };
  if (!response.ok || body.error) throw new Error(body.error || "Ollama request failed");
  return {
    text: body.response ?? "",
    truncated: body.done_reason === "length",
  };
}
