import { parse, stringify } from "yaml";

export type ReferenceKind = "gerrit" | "jira" | "github" | "teams" | "web" | "note";

export type NoteReference = {
  id: string;
  kind: ReferenceKind;
  url?: string;
  noteId?: string;
  label: string;
};

export type NoteMetadata = { id: string; references: NoteReference[] };

const EMPTY: NoteMetadata = { id: "", references: [] };

export function readNoteMetadata(markdown: string): NoteMetadata {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) return EMPTY;
  try {
    const value = parse(match[1]) as { notes?: unknown } | null;
    const notes = value?.notes as { id?: unknown; references?: unknown } | undefined;
    const references = Array.isArray(notes?.references) ? notes.references.flatMap(normalizeReference) : [];
    return { id: typeof notes?.id === "string" ? notes.id : "", references };
  } catch {
    return EMPTY;
  }
}

export function noteBody(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, "");
}

export function withNoteMetadata(markdown: string, metadata: NoteMetadata): string {
  const body = noteBody(markdown);
  const frontmatter = stringify({ notes: { id: metadata.id, references: metadata.references } }).trimEnd();
  return `---\n${frontmatter}\n---\n${body}`;
}

export function ensureNoteMetadata(markdown: string, makeId: () => string = () => crypto.randomUUID()): string {
  const metadata = readNoteMetadata(markdown);
  return metadata.id ? markdown : withNoteMetadata(markdown, { ...metadata, id: makeId() });
}

export function classifyReference(input: string): ReferenceKind {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (host.includes("github")) return "github";
    if (host.includes("atlassian") || /(?:^|\.)jira\./.test(host)) return "jira";
    if (host.includes("gerrit")) return "gerrit";
    if (host.includes("teams.microsoft")) return "teams";
  } catch { /* Kept as a generic reference; offline and private URLs are valid. */ }
  return "web";
}

export function referenceLabel(input: string, kind = classifyReference(input)): string {
  try {
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname).replace(/\/$/, "");
    if (kind === "github") {
      const parts = path.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => part === "issues" || part === "pull");
      return marker > 1 && parts[marker + 1] ? `${parts[0]}/${parts[1]} #${parts[marker + 1]}` : parts.slice(0, 2).join("/") || url.hostname;
    }
    if (kind === "jira") return path.split("/").filter(Boolean).pop() || url.hostname;
    if (kind === "gerrit") return path.match(/(?:\+\/|\/c\/[^/]+\/\+\/)(\d+)/)?.[1] ? `Change ${path.match(/(\d+)\/?$/)?.[1]}` : url.hostname;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input.trim().slice(0, 48);
  }
}

export function wikiLinks(markdown: string): string[] {
  return [...noteBody(markdown).matchAll(/\[\[([^\]\n]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
}

function normalizeReference(value: unknown): NoteReference[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.label !== "string") return [];
  const kind = item.kind;
  if (!(["gerrit", "jira", "github", "teams", "web", "note"] as unknown[]).includes(kind)) return [];
  return [{ id: item.id, kind: kind as ReferenceKind, label: item.label,
    ...(typeof item.url === "string" ? { url: item.url } : {}),
    ...(typeof item.noteId === "string" ? { noteId: item.noteId } : {}) }];
}
