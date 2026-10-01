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
  const start = Math.max(0, at - 42);
  const end = Math.min(text.length, at + length + 72);
  return `${start ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}
