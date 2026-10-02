import { chartRequest, requestChart, type ChartRepair } from "../vault-api";
import { renderPythonChart, type ChartImage } from "./python";
import { parseRecipe, validateIdea, type ChartRecipe } from "./recipe";

export type TraceStep = {
  id: number; attempt: number; name: string; status: "running" | "done" | "error";
  started: number; elapsed?: number; input: string; output?: string; error?: string;
};
export type AgentUpdate = { status: string; steps: TraceStep[] };
type Dependencies = { request: typeof requestChart; render: typeof renderPythonChart };
const defaults: Dependencies = { request: requestChart, render: renderPythonChart };
export const MAX_CHART_ATTEMPTS = 3;

// One task, one tool and a fixed repair budget. No conversation, memory or planner.
export async function runChartAgent({ host, model, idea, signal, onUpdate }: {
  host: string; model: string; idea: string; signal: AbortSignal; onUpdate: (update: AgentUpdate) => void;
}, dependencies: Dependencies = defaults): Promise<{ recipe: ChartRecipe; image: ChartImage }> {
  validateIdea(idea);
  const steps: TraceStep[] = [];
  let repair: ChartRepair | undefined;
  const emit = (status: string) => { if (!signal.aborted) onUpdate({ status, steps: steps.map(step => ({ ...step })) }); };
  const start = (attempt: number, name: string, input: string) => {
    const step: TraceStep = { id: steps.length, attempt, name, input, started: Date.now(), status: "running" };
    steps.push(step); emit(name); return step;
  };
  const finish = (step: TraceStep, output: string, status: "done" | "error" = "done") => {
    if (status === "error") step.error = output; else step.output = output;
    step.status = status; step.elapsed = Date.now() - step.started; emit(step.name);
  };
  for (let attempt = 1; attempt <= MAX_CHART_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    const modelStep = start(attempt, repair ? `Repairing chart · ${attempt}/${MAX_CHART_ATTEMPTS}` : "Generating Python",
      JSON.stringify({ endpoint: `${host.trim().replace(/\/+$/, "")}/api/chat`, ...chartRequest(model, idea, repair) }, null, 2));
    if (!repair) emit("Waiting for Ollama response");
    let raw: string;
    try {
      raw = await dependencies.request(host, model, idea, signal, repair, content => {
        if (signal.aborted || modelStep.status !== "running") return;
        modelStep.output = content; emit(`Generating Python · ${content.length.toLocaleString()} characters`);
      });
      signal.throwIfAborted();
      finish(modelStep, raw);
    } catch (error) {
      signal.throwIfAborted();
      finish(modelStep, message(error), "error");
      throw error; // A transport/model failure is not a Python error. Don't repeat it blindly.
    }
    const toolStep = start(attempt, "Validating and drawing", raw);
    try {
      const recipe = parseRecipe(raw);
      toolStep.input = recipe.code;
      emit("Validating and drawing");
      const image = await dependencies.render(recipe.code, signal, emit);
      signal.throwIfAborted();
      finish(toolStep, `PNG · ${image.width} × ${image.height}`);
      return { recipe, image };
    } catch (error) {
      signal.throwIfAborted();
      const detail = Array.from(message(error)).slice(-2200).join("");
      finish(toolStep, detail, "error");
      if (attempt === MAX_CHART_ATTEMPTS) throw new Error(`Chart failed after ${MAX_CHART_ATTEMPTS} attempts. ${detail}`);
      repair = { previousResponse: raw, error: detail };
    }
  }
  throw new Error("Chart attempt limit reached.");
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
