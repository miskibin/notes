import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { GenerationStatus } from "../vendor/chat-components/components/ui/generation-status";
import { runChartAgent, type AgentUpdate } from "./agent";
import type { ChartImage } from "./python";
import type { ChartRecipe } from "./recipe";

export default function VisualizeRun({ idea, host, model, onClose, onInsert, onSettings, onBusy }: {
  idea: string; host: string; model: string; onClose: () => void; onSettings: () => void;
  onInsert: (recipe: ChartRecipe, image: ChartImage) => Promise<{ asset: string } | string>;
  onBusy: (busy: boolean) => void;
}) {
  const [update, setUpdate] = useState<AgentUpdate>({ status: "Generating Python", steps: [] });
  const [state, setState] = useState<"running" | "done" | "error" | "cancelled">("running");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onInsert, onBusy });
  callbacks.current = { onInsert, onBusy };
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    // Defer startup so StrictMode's probe doesn't issue a model request.
    const timer = window.setTimeout(() => {
      setState("running"); setError(null); setCopyStatus("");
      setUpdate({ status: "Generating Python", steps: [] });
      callbacks.current.onBusy(true);
      void (async () => {
        try {
          if (!model.trim()) throw new Error("Choose an edit model in Settings.");
          const result = await runChartAgent({ host, model, idea, signal: abort.signal, onUpdate: setUpdate });
          abort.signal.throwIfAborted();
          const started = Date.now();
          setUpdate(current => ({ status: "Saving PNG to note", steps: [...current.steps, {
            id: current.steps.length, attempt: current.steps[current.steps.length - 1]?.attempt ?? 1,
            name: "Saving PNG to note", status: "running", started,
            input: JSON.stringify({ title: result.recipe.title, width: result.image.width, height: result.image.height }),
          }] }));
          const insertion = await callbacks.current.onInsert(result.recipe, result.image);
          abort.signal.throwIfAborted();
          if (typeof insertion === "string") throw new Error(insertion);
          setState("done");
          setUpdate(current => ({ status: "Chart inserted", steps: current.steps.map(step => step.name === "Saving PNG to note" ?
            { ...step, status: "done", elapsed: Date.now() - started, output: insertion.asset.startsWith("data:") ? "PNG inserted into browser note" : insertion.asset } : step) }));
        } catch (cause) {
          if (abort.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : String(cause)); setState("error");
          setUpdate(current => ({ status: "Chart failed", steps: current.steps.map(step => step.status === "running" ?
            { ...step, status: "error", elapsed: Date.now() - step.started, output: cause instanceof Error ? cause.message : String(cause) } : step) }));
        } finally { if (!abort.signal.aborted) callbacks.current.onBusy(false); }
      })();
    }, 0);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [idea, host, model, attempt]);
  const cancel = () => {
    controller.current?.abort(); setState("cancelled"); callbacks.current.onBusy(false);
    setUpdate(current => ({ status: "Cancelled", steps: current.steps.map(step => step.status === "running" ?
      { ...step, status: "error", output: "Cancelled", elapsed: Date.now() - step.started } : step) }));
  };
  const busy = state === "running";
  return <section className="visualize-run" aria-label="Visualization activity" aria-busy={busy}>
    <div className="visualize-status-row">
      {busy ? <GenerationStatus active label={update.status} /> : <span className="visualize-outcome" role="status">{state === "done" ? <Check aria-hidden /> : null}{update.status}</span>}
      <span className="visualize-model" title={model}>{model || "No model"}</span>
      {busy ? <button type="button" onClick={cancel}>Cancel</button> : null}
      {state === "error" || state === "cancelled" ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button> : null}
      <button type="button" className="visualize-dismiss" aria-label="Dismiss visualization activity" onClick={onClose}><X aria-hidden /></button>
    </div>
    {error ? <p className="visualize-problem" role="alert">{error}{!model.trim() ? <button type="button" onClick={onSettings}>Settings</button> : null}</p> : null}
    <details className="visualize-trace"><summary>Details <span>{update.steps.length} steps</span></summary>
      <div className="visualize-trace-body">
        <div className="visualize-trace-toolbar"><span>Ollama → Python → PNG</span><button type="button" onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify({ model, idea, state, ...update }, null, 2)).then(() => setCopyStatus("Copied")).catch(() => setCopyStatus("Copy failed"));
        }}><Copy aria-hidden />{copyStatus || "Copy log"}</button></div>
        {update.steps.map(step => <details key={step.id} className="visualize-step" data-status={step.status}>
          <summary><span>{step.name}</span><small>Attempt {step.attempt} · {step.status}{step.elapsed != null ? ` · ${(step.elapsed / 1000).toFixed(1)}s` : ""}</small></summary>
          <div><span className="trace-label">Input</span><pre tabIndex={0}>{step.input}</pre>
            {step.output != null ? <><span className="trace-label">Output</span><pre tabIndex={0}>{step.output}</pre></> : null}</div>
        </details>)}
      </div>
    </details>
  </section>;
}
