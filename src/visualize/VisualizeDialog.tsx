import { useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, CodeXml, Eye, LoaderCircle, X } from "lucide-react";
import { visualizeIdea } from "../vault-api";
import { renderPythonChart, type ChartImage } from "./python";
import type { ChartRecipe } from "./recipe";

export default function VisualizeDialog({ idea, host, model, onClose, onInsert, onSettings }: {
  idea: string; host: string; model: string;
  onClose: () => void;
  onInsert: (recipe: ChartRecipe, image: ChartImage) => Promise<string | null>;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [recipe, setRecipe] = useState<ChartRecipe | null>(null);
  const [image, setImage] = useState<ChartImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(model.trim()));
  const [inserting, setInserting] = useState(false);
  const [progress, setProgress] = useState("Designing the chart…");
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    return () => { alive.current = false; element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!model.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true); setError(null); setRecipe(null); setImage(null); setProgress("Designing the chart…");
      void (async () => {
        try {
          const next = await visualizeIdea(host, model, idea, controller.signal);
          if (controller.signal.aborted) return;
          setRecipe(next);
          const chart = await renderPythonChart(next.code, controller.signal, setProgress);
          if (!controller.signal.aborted) setImage(chart);
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
        } finally { if (!controller.signal.aborted) setBusy(false); }
      })();
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [idea, host, model, attempt]);

  return (
    <dialog className="format-dialog visualize-dialog" ref={dialog} aria-labelledby="visualize-title" aria-describedby="visualize-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')).filter((item) => item.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="format-header">
        <div className="format-heading-icon"><ChartNoAxesCombined aria-hidden="true" /></div>
        <div><h2 id="visualize-title">Visualize</h2><p id="visualize-description">Turn your selected idea into a chart. Preview it before adding it to the note.</p></div>
        <button className="format-close" type="button" aria-label="Close visualization" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="format-toolbar">
        <span className="format-model" title={model}>Edit model · {model || "Not selected"}</span>
        {recipe ? <div className="format-view-switch" role="group" aria-label="Visualization mode">
          <button type="button" aria-pressed={!source} onClick={() => setSource(false)}><Eye aria-hidden="true" /> Chart</button>
          <button type="button" aria-pressed={source} onClick={() => setSource(true)}><CodeXml aria-hidden="true" /> Python</button>
        </div> : null}
      </div>
      <div className="format-body" aria-busy={busy}>
        {!model.trim() ? <div className="format-empty"><h3>Choose an edit model</h3><p>Visualize uses your Ollama edit model to design the chart.</p><button type="button" className="format-primary" onClick={onSettings}>Open Settings</button></div> : null}
        {source && recipe ? <pre className="format-source" tabIndex={0} aria-label="Chart Python code">{recipe.code}</pre> :
          image && recipe ? <figure className="visualize-figure">
            <figcaption><span className="visualize-kind">{recipe.kind === "illustrative" ? "Illustrative" : "Provided data"}</span><strong>{recipe.title}</strong><p>{recipe.caption}</p></figcaption>
            <img src={image.dataUrl} alt={recipe.title} width={image.width} height={image.height} /></figure> :
            busy ? <div className="format-empty" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" /><h3>{progress}</h3><p>You can cancel at any time.</p></div> : null}
        {error && !image ? <div className="visualize-error" role="alert"><h3>Could not draw this chart</h3><p>{error}</p>
          <div className="format-error-actions"><button type="button" onClick={() => { setSource(false); setAttempt((value) => value + 1); }}>Try again</button><button type="button" onClick={onSettings}>Open Settings</button></div></div> : null}
      </div>
      <footer className="format-actions">
        <p role="status" aria-live="polite" className={error && image ? "footer-error" : ""}>{error && image ? error : "The chart is added after the selected text. Ctrl+Z undoes insertion."}</p>
        <button type="button" onClick={onClose}>{busy ? "Cancel" : "Discard"}</button>
        <button type="button" className="format-primary" disabled={!recipe || !image || busy || inserting} onClick={() => {
          if (!recipe || !image || inserting) return;
          setInserting(true);
          void onInsert(recipe, image).then((problem) => { if (alive.current && problem) setError(problem); })
            .catch((cause: unknown) => { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); })
            .finally(() => { if (alive.current) setInserting(false); });
        }}>{inserting ? "Inserting…" : "Insert chart"}</button>
      </footer>
    </dialog>
  );
}
