import { isMap, parse, parseDocument, stringify } from "yaml";

export type ReferenceKind = "gerrit" | "jira" | "github" | "teams" | "web" | "note";

export type NoteReference = {
  id: string;
  kind: ReferenceKind;
  url?: string;
  noteId?: string;
  label: string;
  wiki?: boolean;
};

export type NoteMetadata = { id: string; references: NoteReference[] };

const EMPTY: NoteMetadata = { id: "", references: [] };

function frontmatter(markdown: string): RegExpExecArray | null {
  const match = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(markdown);
  return match?.index === 0 ? match : null;
}

export function readNoteMetadata(markdown: string): NoteMetadata {
  const match = frontmatter(markdown);
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
  const match = frontmatter(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}

export function withNoteBody(markdown: string, body: string): string {
  const match = frontmatter(markdown);
  return match ? match[0] + body : body;
}

export function withNoteMetadata(markdown: string, metadata: NoteMetadata): string {
  const body = noteBody(markdown);
  const existing = frontmatter(markdown);
  if (!existing) return `---\n${stringify({ notes: metadata }).trimEnd()}\n---\n${body}`;
  const document = parseDocument(existing[1]);
  if (document.errors.length || (document.contents != null && !isMap(document.contents))) {
    throw new Error("The note's YAML metadata must be a valid mapping before adding references.");
  }
  const notes = document.get("notes", true);
  if (notes != null && !isMap(notes)) throw new Error("The notes metadata must be a YAML mapping.");
  document.setIn(["notes", "id"], metadata.id);
  document.setIn(["notes", "references"], metadata.references);
  return `---\n${document.toString().trimEnd()}\n---\n${body}`;
}

export function ensureNoteMetadata(markdown: string, makeId: () => string = () => crypto.randomUUID()): string {
  const metadata = readNoteMetadata(markdown);
  if (metadata.id) return markdown;
  try { return withNoteMetadata(markdown, { ...metadata, id: makeId() }); }
  catch { return markdown; }
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
  const body = noteBody(markdown).replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1[^\n]*(?:\n|$)/gm, "")
    .replace(/(`+)[^\n]*?\1/g, "");
  return [...new Set([...body.matchAll(/(?<!\\)\[\[([^\]\n]+)\]\]/g)].map((match) => match[1].trim()).filter(Boolean))];
}

export function referenceUrl(input: string): string {
  const url = new URL(input);
  if (!["http:", "https:", "msteams:"].includes(url.protocol)) throw new Error("Use an HTTP, HTTPS or Teams URL.");
  return url.href;
}

export function bindWikiReferences(markdown: string, documents: { title: string; markdown: string }[]): string {
  const metadata = readNoteMetadata(markdown);
  const linked = wikiLinks(markdown);
  const folded = linked.map(label => label.toLocaleLowerCase());
  const references = metadata.references.filter(reference => !reference.wiki || folded.includes(reference.label.toLocaleLowerCase()));
  for (const label of linked) {
    if (references.some(reference => reference.kind === "note" && reference.label.toLocaleLowerCase() === label.toLocaleLowerCase())) continue;
    const target = documents.find(document => document.title.toLocaleLowerCase() === label.toLocaleLowerCase());
    const noteId = target ? readNoteMetadata(target.markdown).id : "";
    if (noteId) references.push({ id: crypto.randomUUID(), kind: "note", noteId, label, wiki: true });
  }
  if (JSON.stringify(references) === JSON.stringify(metadata.references)) return markdown;
  try { return withNoteMetadata(markdown, { id: metadata.id || crypto.randomUUID(), references }); }
  catch { return markdown; }
}

function normalizeReference(value: unknown): NoteReference[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.label !== "string") return [];
  const kind = item.kind;
  if (!(["gerrit", "jira", "github", "teams", "web", "note"] as unknown[]).includes(kind)) return [];
  return [{ id: item.id, kind: kind as ReferenceKind, label: item.label,
    ...(typeof item.url === "string" ? { url: item.url } : {}),
    ...(typeof item.noteId === "string" ? { noteId: item.noteId } : {}),
    ...(item.wiki === true ? { wiki: true } : {}) }];
}
