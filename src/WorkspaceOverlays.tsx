import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, GitPullRequest, Link2, MessageSquare, Pencil, Search, Ticket, X } from "lucide-react";
import { classifyReference, noteBody, referenceLabel, referenceUrl, type NoteMetadata, type NoteReference } from "./note-metadata";
import { WindowDialog } from "./WindowDialog";
import { titleFrom } from "./notes";
import { searchNotes, type SearchDocument } from "./note-search";
import { readHistory, type HistoryEntry } from "./vault-api";

const WorkspaceDialog = WindowDialog;

export function ReferenceBar({ metadata, onAdd, onEdit, onOpen, backlinks, onOpenNote }: {
  metadata: NoteMetadata; onAdd: () => void; onEdit: (reference: NoteReference) => void;
  onOpen: (reference: NoteReference) => void; backlinks: { name: string; title: string }[]; onOpenNote: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? metadata.references : metadata.references.slice(0, 5);
  if (!metadata.references.length && !backlinks.length) return null;
  return <div className="reference-area">
    <div className="reference-row" aria-label="References">
      {visible.map((reference) => <span className="reference-item" key={reference.id}><button type="button" className="reference-chip"
        onClick={() => onOpen(reference)} title={reference.url ?? reference.label}>
        <ReferenceIcon kind={reference.kind} /><span>{reference.label}</span>
      </button>{reference.kind !== "note" ? <button className="reference-edit" type="button" aria-label={`Edit reference ${reference.label}`} onClick={() => onEdit(reference)}><Pencil aria-hidden /></button> : null}</span>)}
      {!expanded && metadata.references.length > 5 ? <button className="reference-more" type="button" onClick={() => setExpanded(true)}>+{metadata.references.length - 5}</button> : null}
      {expanded && metadata.references.length > 5 ? <button className="reference-more" type="button" onClick={() => setExpanded(false)}>Show less</button> : null}
      <button type="button" className="reference-add" onClick={onAdd} aria-label="Add reference" title="Add reference (Ctrl+Shift+L)">+</button>
      {backlinks.length ? <details className="backlinks"><summary>{backlinks.length} linking note{backlinks.length === 1 ? "" : "s"}</summary>
        <div>{backlinks.map((note) => <button type="button" key={note.name} onClick={() => onOpenNote(note.name)}>{note.title}</button>)}</div>
      </details> : null}
    </div>
  </div>;
}

function ReferenceIcon({ kind }: { kind: NoteReference["kind"] }) {
  const Icon = kind === "github" || kind === "gerrit" ? GitPullRequest : kind === "jira" ? Ticket : kind === "teams" ? MessageSquare : kind === "note" ? FileText : Link2;
  return <Icon aria-hidden />;
}

export function ReferenceDialog({ initial, onClose, onSave, onRemove }: { initial?: NoteReference; onClose: () => void;
  onSave: (input: string, label: string) => string | null; onRemove: () => string | null }) {
  const [input, setInput] = useState(initial?.url ?? "");
  const preview = useMemo(() => {
    try { const url = referenceUrl(input.trim()); const kind = classifyReference(url); return { kind, label: initial?.url === url ? initial.label : referenceLabel(url, kind) }; }
    catch { return null; }
  }, [input, initial]);
  const [error, setError] = useState<string | null>(null);
  return <WorkspaceDialog name={initial ? "Edit reference" : "Add reference"} className="workspace-dialog reference-dialog" onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) setError(onSave(input.trim(), initial?.url === input.trim() ? initial.label : "")); }}>
      <header><strong>{initial ? "Edit reference" : "Add reference"}</strong><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
      <label>URL<input autoFocus value={input} onChange={(event) => { setInput(event.target.value); setError(null); }} placeholder="Paste a Gerrit, Jira, GitHub, Teams or web URL" /></label>
      {preview ? <div className="reference-preview"><ReferenceIcon kind={preview.kind} /><span>{preview.label}</span></div> : null}
      {error ? <p role="alert" className="workspace-error">{error}</p> : null}
      <footer>{initial ? <button type="button" onClick={() => setError(onRemove())}>Remove reference</button> : null}<button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!input.trim()}>Save reference</button></footer>
    </form>
  </WorkspaceDialog>;
}

export function SearchDialog({ documents, recent, loading, onClose, onOpen }: {
  documents: SearchDocument[]; recent: string[]; loading: boolean; onClose: () => void; onOpen: (name: string, offset: number, query: string) => void;
}) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0); const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => query ? searchNotes(documents, query) : recent.flatMap((name) => documents.filter((item) => item.name === name).map((item) => ({ ...item, snippet: "Recently opened", offset: -1, score: 0 }))), [documents, query, recent]);
  useEffect(() => setSelected(0), [query]);
  return <WorkspaceDialog name="Search notes" className="workspace-dialog search-dialog" onClose={onClose}>
    <div className="search-box"><Search /><input ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes and references…"
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((v) => Math.max(0, Math.min(results.length - 1, v + 1))); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((v) => Math.max(0, v - 1)); } if (event.key === "Enter" && results[Math.min(selected, results.length - 1)]) { const result = results[Math.min(selected, results.length - 1)]; onOpen(result.name, result.offset, query); } }} /></div>
    <p className="dialog-section-label">{query ? "Results" : "Recently opened"}</p>
    <div className="search-results">{results.map((result, index) => <button type="button" data-selected={index === Math.min(selected, results.length - 1)} key={result.name} onMouseEnter={() => setSelected(index)} onClick={() => onOpen(result.name, result.offset, query)}>
      <strong>{result.title}</strong><span>{result.snippet}</span>
    </button>)}{loading ? <p>Indexing notes…</p> : !results.length ? <p>{query ? "No matches" : "No recent notes"}</p> : null}</div>
  </WorkspaceDialog>;
}

export function HistoryDialog({ entries, vault, activeNote, currentBody, onClose, onRestore }: {
  entries: HistoryEntry[]; vault: string; activeNote: string | null; currentBody: string;
  onClose: () => void; onRestore: (entry: HistoryEntry) => void;
}) {
  const [scope, setScope] = useState(activeNote ? "note" : "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ id: string; body?: string; error?: string } | null>(null);
  const visible = useMemo(() => entries.filter(entry => scope === "all" || entry.note === activeNote)
    .sort((a, b) => b.modified_ms - a.modified_ms), [entries, scope, activeNote]);
  const selected = visible.find(entry => entry.id === selectedId) ?? visible[0];
  const id = selected?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void readHistory(vault, id).then(body => { if (alive) setSnapshot({ id, body }); })
      .catch(error => { if (alive) setSnapshot({ id, error: error instanceof Error ? error.message : String(error) }); });
    return () => { alive = false; };
  }, [vault, id]);
  const loaded = snapshot?.id === id ? snapshot : null;
  const body = loaded?.body != null ? noteBody(loaded.body) : null;
  const words = body?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const currentWords = noteBody(currentBody).trim().split(/\s+/).filter(Boolean).length;
  const delta = words - currentWords;
  return <WorkspaceDialog name="History and recovery" className="workspace-dialog history-dialog" onClose={onClose}>
    <header><strong>History</strong><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="history-scope" role="group" aria-label="History scope">
      {activeNote ? <button type="button" aria-pressed={scope === "note"} onClick={() => { setScope("note"); setSelectedId(null); }}>This note</button> : null}
      <button type="button" aria-pressed={scope === "all"} onClick={() => { setScope("all"); setSelectedId(null); }}>All notes</button>
      <span>{visible.length} version{visible.length === 1 ? "" : "s"}</span>
    </div>
    <div className="history-content">
      <div className="history-list" role="group" aria-label="Saved versions">
        {visible.map(entry => <button type="button" key={entry.id} aria-pressed={entry.id === id} onClick={() => setSelectedId(entry.id)}>
          {scope === "all" ? <strong>{entry.note.replace(/\.md$/i, "")}</strong> : null}
          <time dateTime={new Date(entry.modified_ms).toISOString()} title={new Date(entry.modified_ms).toLocaleString()}>{historyDate(entry.modified_ms)}</time>
          <small>{entry.deleted ? "Deleted" : "Saved version"}</small>
        </button>)}
        {!visible.length ? <p>No saved versions.</p> : null}
      </div>
      <section className="history-preview" aria-label="Version preview" aria-busy={Boolean(id && !loaded)}>
        {body != null && selected ? <><div className="history-preview-heading"><strong>{titleFrom(body, selected.note)}</strong>
          <span>{words} words · {body.split("\n").length} lines{selected.note === activeNote ? ` · ${delta === 0 ? "same word count" : `${delta > 0 ? "+" : ""}${delta} words vs current`}` : ""}</span></div>
          <pre tabIndex={0}>{body}</pre></> : loaded?.error ? <p role="alert" className="workspace-error">{loaded.error}</p> : <p>{id ? "Loading version…" : "Select a version to preview."}</p>}
      </section>
    </div>
    <footer className="history-actions"><span>Current content is saved before restoring.</span><button type="button" disabled={body == null || !selected} onClick={() => { if (selected && body != null) onRestore(selected); }}>Restore version</button></footer>
  </WorkspaceDialog>;
}

function historyDate(timestamp: number): string {
  const date = new Date(timestamp), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  return `${day} · ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}
