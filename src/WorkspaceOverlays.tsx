import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, FileText, GitPullRequest, Link2, MessageSquare, Search, Ticket, X } from "lucide-react";
import type { NoteMetadata, NoteReference } from "./note-metadata";
import { searchNotes, type SearchDocument } from "./note-search";
import type { HistoryEntry } from "./vault-api";

export function ReferenceBar({ metadata, onAdd, onEdit, onOpen, backlinks, onOpenNote }: {
  metadata: NoteMetadata; onAdd: () => void; onEdit: (reference: NoteReference) => void;
  onOpen: (reference: NoteReference) => void; backlinks: { name: string; title: string }[]; onOpenNote: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? metadata.references : metadata.references.slice(0, 5);
  if (!metadata.references.length && !backlinks.length) return <div className="reference-actions"><button type="button" onClick={onAdd}><Link2 /> Add reference</button></div>;
  return <div className="reference-area">
    <div className="reference-row" aria-label="References">
      {visible.map((reference) => <button type="button" className="reference-chip" key={reference.id}
        onClick={() => onOpen(reference)} onDoubleClick={() => onEdit(reference)} title={`${reference.url ?? reference.label} · Double-click to edit`}>
        <ReferenceIcon kind={reference.kind} /><span>{reference.label}</span>
      </button>)}
      {!expanded && metadata.references.length > 5 ? <button className="reference-more" type="button" onClick={() => setExpanded(true)}>+{metadata.references.length - 5}</button> : null}
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

export function ReferenceDialog({ initial, onClose, onSave }: { initial?: NoteReference; onClose: () => void; onSave: (input: string, label: string) => void }) {
  const [input, setInput] = useState(initial?.url ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  return <dialog open className="workspace-dialog reference-dialog" onCancel={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) onSave(input.trim(), label.trim()); }}>
      <header><strong>{initial ? "Edit reference" : "Add reference"}</strong><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
      <label>URL<input autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a Gerrit, Jira, GitHub, Teams or web URL" /></label>
      <label>Description <span>(optional)</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="A short label is generated locally" /></label>
      <p>Private links stay local. Adding works without network access or SSO.</p>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save reference</button></footer>
    </form>
  </dialog>;
}

export function SearchDialog({ documents, recent, loading, onClose, onOpen }: {
  documents: SearchDocument[]; recent: string[]; loading: boolean; onClose: () => void; onOpen: (name: string, offset: number, query: string) => void;
}) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(0); const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => query ? searchNotes(documents, query) : recent.flatMap((name) => documents.filter((item) => item.name === name).map((item) => ({ ...item, snippet: "Recently opened", offset: -1, score: 0 }))), [documents, query, recent]);
  useEffect(() => setSelected(0), [query]);
  return <dialog open className="workspace-dialog search-dialog" onCancel={onClose}>
    <div className="search-box"><Search /><input ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes and references…"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown") { event.preventDefault(); setSelected((v) => Math.min(results.length - 1, v + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((v) => Math.max(0, v - 1)); } if (event.key === "Enter" && results[selected]) onOpen(results[selected].name, results[selected].offset, query); }} /></div>
    <p className="dialog-section-label">{query ? "Results" : "Recently opened"}</p>
    <div className="search-results">{results.map((result, index) => <button type="button" data-selected={index === selected} key={result.name} onMouseEnter={() => setSelected(index)} onClick={() => onOpen(result.name, result.offset, query)}>
      <strong>{result.title}</strong><span>{result.snippet}</span>
    </button>)}{loading ? <p>Indexing notes…</p> : !results.length ? <p>{query ? "No matches" : "No recent notes"}</p> : null}</div>
  </dialog>;
}

export function HistoryDialog({ entries, onClose, onRestore }: { entries: HistoryEntry[]; onClose: () => void; onRestore: (entry: HistoryEntry) => void }) {
  return <dialog open className="workspace-dialog history-dialog" onCancel={onClose}><header><strong>History & recovery</strong><button onClick={onClose} aria-label="Close"><X /></button></header>
    <p className="history-intro">Local snapshots are created before edits and deletion. Restoring creates another recoverable version.</p>
    <div className="history-list">{entries.map((entry) => <div key={entry.id}><ArchiveRestore /><span><strong>{entry.note.replace(/\.md$/i, "")}</strong><small>{entry.deleted ? "Deleted note" : "Earlier version"} · {new Date(entry.modified_ms).toLocaleString()}</small></span><button type="button" onClick={() => onRestore(entry)}>Restore</button></div>)}
      {!entries.length ? <p>No earlier versions yet.</p> : null}</div>
  </dialog>;
}
