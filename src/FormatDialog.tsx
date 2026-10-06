import { useEffect, useRef, useState } from "react";
import { CodeXml, Eye, LoaderCircle, WandSparkles, X } from "lucide-react";
import { WindowDialog } from "./WindowDialog";
import { NoteCanvas } from "./editor/NoteCanvas";
import type { CompleteBridge } from "./editor/autocomplete";
import type { EditorHandle } from "./editor/editor-handle";
import type { FormatSnapshot } from "./formatting";
import type { StructurePatch, StructureResult } from "./structure";
import { formatNote, formatStructure } from "./vault-api";
import { noteBody, withNoteBody } from "./note-metadata";

const previewBridge: { current: CompleteBridge } = { current: {
  enabled: false, model: "", editModel: "",
  complete: async () => ({ text: "", truncated: false }), edit: async () => "",
} };
const ignoreChange = () => {};
type Mode = "structure" | "generative";

export function FormatDialog({ snapshot, host, model, decisionModel, valid, onClose, onApply, onSettings }: {
  snapshot: FormatSnapshot;
  host: string;
  model: string;
  decisionModel: string;
  valid: boolean;
  onClose: () => void;
  onApply: (formatted: string, patch?: StructurePatch) => Promise<string | null>;
  onSettings: () => void;
}) {
  const previewHandle = useRef<EditorHandle | null>(null);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const mounted = useRef(true);
  const [mode, setMode] = useState<Mode>("structure");
  const [result, setResult] = useState<string | null>(null);
  const [patch, setPatch] = useState<StructureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [source, setSource] = useState(false);
  const selectedModel = mode === "structure" ? decisionModel : model;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; runId.current++; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!valid) { runId.current++; controller.current?.abort(); setBusy(false); setResult(null); setPatch(null); }
  }, [valid]);
  // Changing destination/model invalidates even a completed preview. Never sends a request automatically.
  useEffect(() => {
    runId.current++; controller.current?.abort(); setBusy(false); setResult(null); setPatch(null); setError(null);
  }, [host, model, decisionModel]);

  const run = async () => {
    if (busy || !valid || !selectedModel.trim()) return;
    const ticket = ++runId.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(null); setResult(null); setPatch(null);
    try {
      if (mode === "structure") {
        const proposed = await formatStructure(host, decisionModel, snapshot.original, abort.signal);
        if (abort.signal.aborted || ticket !== runId.current) return;
        setPatch(proposed); setResult(proposed.formatted);
      } else {
        const proposed = await formatNote(host, model, noteBody(snapshot.original), abort.signal);
        if (abort.signal.aborted || ticket !== runId.current) return;
        setResult(withNoteBody(snapshot.original, proposed));
      }
    } catch (cause) {
      if (!abort.signal.aborted && ticket === runId.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (!abort.signal.aborted && ticket === runId.current) setBusy(false); }
  };
  const unchanged = result === snapshot.original;
  return (
    <WindowDialog className="format-dialog" labelledBy="format-title" describedBy="format-description" onClose={applying ? () => {} : onClose}>
      <header className="format-header">
        <div className="format-heading-icon"><WandSparkles aria-hidden="true" /></div>
        <div><h2 id="format-title">Format Markdown</h2>
          <p id="format-description">{mode === "structure" ? "Add structure. Keep every original character." : "Headings, lists and readable math. Review before applying."}</p></div>
        <button className="format-close" disabled={applying} type="button" aria-label="Close formatting preview" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="format-toolbar">
        <div className="format-view-switch" role="group" aria-label="Formatting mode">
          {([ ["structure", "Structure only"], ["generative", "Generative"] ] as const).map(([value, label]) =>
            <button key={value} type="button" disabled={busy || applying} aria-pressed={mode === value} onClick={() => {
              setMode(value); setResult(null); setPatch(null); setError(null);
            }}>{label}</button>)}
        </div>
        {result ? <div className="format-view-switch" role="group" aria-label="Preview mode">
          <button type="button" aria-pressed={!source} onClick={() => setSource(false)}><Eye aria-hidden="true" /> Preview</button>
          <button type="button" aria-pressed={source} onClick={() => setSource(true)}><CodeXml aria-hidden="true" /> Markdown</button>
        </div> : null}
      </div>
      <p className="format-destination">{selectedModel || "No model selected"} · {host}</p>
      <div className="format-body" aria-busy={busy || applying}>
        {!valid ? <div className="format-empty" role="alert"><h3>The note changed</h3><p>{error || "Discard this preview and format the current version."}</p></div> : null}
        {valid && busy ? <div className="format-empty" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" /><h3>Organizing your note…</h3></div> : null}
        {valid && !busy && !result && !error ? <div className="format-empty"><WandSparkles aria-hidden="true" />
          <h3>{selectedModel.trim() ? "Ready to format" : mode === "structure" ? "Choose a decision model" : "Choose an edit model"}</h3>
          {selectedModel.trim() ? <button type="button" className="format-primary" onClick={() => void run()}>Generate preview</button> :
            <button type="button" className="format-primary" onClick={onSettings}>Open Settings</button>}</div> : null}
        {valid && result ? <>
          {patch ? <details className="format-changes" open><summary>{patch.insertions.length} proposed changes</summary>
            <ul>{patch.insertions.map(item => <li key={item.fragmentId}><code>{item.text}</code>{patch.original.slice(item.at, patch.original.indexOf("\n", item.at) < 0 ? undefined : patch.original.indexOf("\n", item.at)).replace(/\r$/, "")}</li>)}</ul>
            {patch.invalid ? <p role="status">{patch.invalid} invalid decisions kept unchanged.</p> : null}
          </details> : null}
          {source ? <pre className="format-source" aria-label="Formatted Markdown">{result}</pre> :
            <NoteCanvas noteKey={`format:${runId.current}`} markdown={noteBody(result)} vault={snapshot.vault} bridge={previewBridge}
              onChange={ignoreChange} editorHandle={previewHandle} readOnly />}
        </> : null}
        {valid && !busy && error && !result ? <div className="format-empty"><h3>Could not format this note</h3><p role="alert">{error}</p>
          <div className="format-error-actions"><button type="button" className="format-primary" onClick={() => void run()}>Try again</button>
            <button type="button" onClick={onSettings}>Open Settings</button></div></div> : null}
      </div>
      <footer className="format-actions">
        <p role="status" aria-live="polite" className={error && result ? "footer-error" : ""}>
          {error || (unchanged ? "No changes proposed." : "Ctrl+Z undoes the whole operation.")}</p>
        <button type="button" disabled={applying} onClick={onClose}>{busy ? "Cancel" : "Discard"}</button>
        <button type="button" className="format-primary" disabled={!valid || !result || busy || applying || unchanged} onClick={() => {
          if (!result) return;
          setApplying(true);
          void onApply(result, patch ?? undefined).then(problem => { if (mounted.current && problem) setError(problem); })
            .catch(cause => { if (mounted.current) setError(String(cause)); })
            .finally(() => { if (mounted.current) setApplying(false); });
        }}>{applying ? "Saving…" : "Apply formatting"}</button>
      </footer>
    </WindowDialog>
  );
}
