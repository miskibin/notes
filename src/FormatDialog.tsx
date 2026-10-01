import { useEffect, useRef, useState } from "react";
import { CodeXml, Eye, LoaderCircle, WandSparkles, X } from "lucide-react";
import { NoteCanvas } from "./editor/NoteCanvas";
import type { CompleteBridge } from "./editor/autocomplete";
import type { EditorHandle } from "./editor/editor-handle";
import type { FormatSnapshot } from "./formatting";
import { formatNote } from "./vault-api";

const previewBridge: { current: CompleteBridge } = { current: {
  enabled: false, model: "", editModel: "",
  complete: async () => ({ text: "", truncated: false }), edit: async () => "",
} };
const ignoreChange = () => {};

export function FormatDialog({ snapshot, host, model, onClose, onApply, onSettings }: {
  snapshot: FormatSnapshot;
  host: string;
  model: string;
  onClose: () => void;
  onApply: (formatted: string) => string | null;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previewHandle = useRef<EditorHandle | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(model.trim()));
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!model.trim()) return;
    const controller = new AbortController();
    // Defer so StrictMode cleanup does not submit the same note twice.
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      setResult(null);
      void formatNote(host, model, snapshot.original, controller.signal).then((formatted) => {
        if (!controller.signal.aborted) setResult(formatted);
      }).catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [host, model, snapshot, attempt]);

  const unchanged = result === snapshot.original.trim();
  return (
    <dialog className="format-dialog" ref={dialog} aria-labelledby="format-title" aria-describedby="format-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <header className="format-header">
        <div className="format-heading-icon"><WandSparkles aria-hidden="true" /></div>
        <div>
          <h2 id="format-title">Format Markdown</h2>
          <p id="format-description">Headings, lists and readable math. Review the result before applying.</p>
        </div>
        <button className="format-close" type="button" aria-label="Close formatting preview" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="format-toolbar">
        <span className="format-model" title={model}>Edit model · {model || "Not selected"}</span>
        {result ? <div className="format-view-switch" role="group" aria-label="Preview mode">
          <button type="button" aria-pressed={!source} onClick={() => setSource(false)}><Eye aria-hidden="true" /> Preview</button>
          <button type="button" aria-pressed={source} onClick={() => setSource(true)}><CodeXml aria-hidden="true" /> Markdown</button>
        </div> : null}
      </div>
      <div className="format-body" aria-busy={busy}>
        {busy ? <div className="format-empty" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" />
          <h3>Organizing your note…</h3><p>The original stays saved while the model works.</p></div> : null}
        {!model.trim() ? <div className="format-empty"><WandSparkles aria-hidden="true" /><h3>Choose an edit model</h3>
          <p>Formatting uses your Ollama edit model. Select one in Settings, then return to this note.</p>
          <button type="button" className="format-primary" onClick={onSettings}>Open Settings</button></div> : null}
        {result ? source ? <pre className="format-source" aria-label="Formatted Markdown">{result}</pre> :
          <NoteCanvas noteKey={`format:${attempt}`} markdown={result} vault={snapshot.vault} bridge={previewBridge}
            onChange={ignoreChange} editorHandle={previewHandle} readOnly /> : null}
        {!busy && error && !result ? <div className="format-empty"><h3>Could not format this note</h3><p role="alert">{error}</p>
          <div className="format-error-actions"><button type="button" className="format-primary" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
            <button type="button" onClick={onSettings}>Open Settings</button></div></div> : null}
      </div>
      <footer className="format-actions">
        <p role="status" aria-live="polite" className={error && result ? "footer-error" : ""}>
          {error && result ? error : unchanged ? "This note is already formatted." : "Your original is unchanged. Ctrl+Z undoes an applied format."}
        </p>
        <button type="button" onClick={onClose}>{busy ? "Cancel" : "Discard"}</button>
        <button type="button" className="format-primary" disabled={!result || busy || unchanged} onClick={() => {
          if (!result) return;
          const problem = onApply(result);
          if (problem) setError(problem);
        }}>Apply formatting</button>
      </footer>
    </dialog>
  );
}
