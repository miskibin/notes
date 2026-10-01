import { noteBody, readNoteMetadata } from "./note-metadata";
import type { NoteFile } from "./notes";

export type SearchDocument = NoteFile & { markdown: string };
export type SearchResult = SearchDocument & { snippet: string; offset: number; score: number };

export function searchNotes(documents: SearchDocument[], query: string): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return documents.flatMap((document) => {
    const metadata = readNoteMetadata(document.markdown);
    const body = noteBody(document.markdown);
    const referenceText = metadata.references.map((item) => `${item.label} ${item.url ?? ""}`).join(" ");
    const titleAt = document.title.toLocaleLowerCase().indexOf(needle);
    const bodyAt = body.toLocaleLowerCase().indexOf(needle);
    const referenceAt = referenceText.toLocaleLowerCase().indexOf(needle);
    if (titleAt < 0 && bodyAt < 0 && referenceAt < 0) return [];
    const source = bodyAt >= 0 ? body : referenceText;
    const at = bodyAt >= 0 ? bodyAt : Math.max(0, referenceAt);
    return [{ ...document, offset: bodyAt, snippet: excerpt(source, at, needle.length),
      score: titleAt >= 0 ? 3 : referenceAt >= 0 ? 2 : 1 }];
  }).sort((a, b) => b.score - a.score || b.modified_ms - a.modified_ms);
}

function excerpt(text: string, at: number, length: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const normalizedAt = Math.min(flat.length, at);
  const start = Math.max(0, normalizedAt - 42);
  const end = Math.min(flat.length, normalizedAt + length + 72);
  return `${start ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
