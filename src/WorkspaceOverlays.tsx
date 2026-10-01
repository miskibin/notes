import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArchiveRestore, FileText, GitPullRequest, Link2, MessageSquare, Pencil, Search, Ticket, X } from "lucide-react";
import type { NoteMetadata, NoteReference } from "./note-metadata";
import { searchNotes, type SearchDocument } from "./note-search";
import type { HistoryEntry } from "./vault-api";

function WorkspaceDialog({ name, className, onClose, children }: {
  name: string; className: string; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} aria-label={name} className={`workspace-dialog ${className}`}
    onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

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
  const [label, setLabel] = useState(initial?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  return <WorkspaceDialog name={initial ? "Edit reference" : "Add reference"} className="reference-dialog" onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) setError(onSave(input.trim(), label.trim())); }}>
      <header><strong>{initial ? "Edit reference" : "Add reference"}</strong><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
      <label>URL<input autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a Gerrit, Jira, GitHub, Teams or web URL" /></label>
      <label>Description <span>(optional)</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="A short label is generated locally" /></label>
      <p>Private links stay local. Adding works without network access or SSO.</p>
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
  return <WorkspaceDialog name="Search notes" className="search-dialog" onClose={onClose}>
    <div className="search-box"><Search /><input ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes and references…"
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((v) => Math.max(0, Math.min(results.length - 1, v + 1))); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((v) => Math.max(0, v - 1)); } if (event.key === "Enter" && results[Math.min(selected, results.length - 1)]) { const result = results[Math.min(selected, results.length - 1)]; onOpen(result.name, result.offset, query); } }} /></div>
    <p className="dialog-section-label">{query ? "Results" : "Recently opened"}</p>
    <div className="search-results">{results.map((result, index) => <button type="button" data-selected={index === Math.min(selected, results.length - 1)} key={result.name} onMouseEnter={() => setSelected(index)} onClick={() => onOpen(result.name, result.offset, query)}>
      <strong>{result.title}</strong><span>{result.snippet}</span>
    </button>)}{loading ? <p>Indexing notes…</p> : !results.length ? <p>{query ? "No matches" : "No recent notes"}</p> : null}</div>
  </WorkspaceDialog>;
}

export function HistoryDialog({ entries, onClose, onRestore }: { entries: HistoryEntry[]; onClose: () => void; onRestore: (entry: HistoryEntry) => void }) {
  return <WorkspaceDialog name="History and recovery" className="history-dialog" onClose={onClose}><header><strong>History & recovery</strong><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
    <p className="history-intro">Local snapshots are created before edits and deletion. Restoring creates another recoverable version.</p>
    <div className="history-list">{entries.map((entry) => <div key={entry.id}><ArchiveRestore /><span><strong>{entry.note.replace(/\.md$/i, "")}</strong><small>{entry.deleted ? "Deleted note" : "Earlier version"} · {new Date(entry.modified_ms).toLocaleString()}</small></span><button type="button" onClick={() => onRestore(entry)}>Restore</button></div>)}
      {!entries.length ? <p>No earlier versions yet.</p> : null}</div>
  </WorkspaceDialog>;
}
