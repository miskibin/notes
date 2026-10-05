import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { completionPlan, prepareGhost } from "./text";

export type CompletionStatus = "idle" | "loading" | "suggestion" | "error";
type Completion = { text: string; truncated: boolean };

export type CompleteBridge = {
  enabled: boolean;
  host?: string;
  model: string;
  editModel: string;
  complete: (line: string, signal?: AbortSignal, onProgress?: (text: string) => void) => Promise<Completion>;
  edit: (instruction: string, text: string) => Promise<string>;
  report?: (status: CompletionStatus, error?: string) => void;
};

type Ghost = { text: string; pos: number } | null;
export const ghostKey = new PluginKey<Ghost>("note-ghost");

function blockContext(view: EditorView) {
  const selection = view.state.selection;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;
  const parent = selection.$from.parent;
  return {
    before: parent.textBetween(0, selection.$from.parentOffset, "\n", (node) => node.textContent || "\ufffc"),
    after: parent.textBetween(selection.$from.parentOffset, parent.content.size, "\n", "\ufffc"),
    code: !!parent.type.spec.code || selection.$from.marks().some((mark) => mark.type.spec.code),
  };
}

function setGhost(view: EditorView, ghost: Ghost): void {
  const previous = ghostKey.getState(view.state);
  if (previous?.text === ghost?.text && previous?.pos === ghost?.pos) return;
  view.dispatch(view.state.tr.setMeta(ghostKey, ghost));
}

export function createAutocompletePlugin(bridge: { current: CompleteBridge }): Plugin<Ghost> {
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;
  let lastEnabled = bridge.current.enabled;
  let lastModel = bridge.current.model;
  let lastHost = bridge.current.host;
  let lastStatus: CompletionStatus = "idle";
  const cache = new Map<string, Completion>();
  const report = (status: CompletionStatus, error?: string) => {
    if (status === lastStatus && !error) return;
    lastStatus = status;
    bridge.current.report?.(status, error);
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    request += 1;
    controller?.abort();
    controller = null;
  };

  const run = async (view: EditorView, ticket: number) => {
    if (ticket !== request || view.isDestroyed || view.composing || !view.hasFocus()) return;
    const context = blockContext(view);
    if (!context) return;
    const current = bridge.current;
    const plan = completionPlan({ ...context, enabled: current.enabled, model: current.model });
    if (!plan) return;
    const pos = view.state.selection.from;
    if (plan.kind === "local") {
      setGhost(view, { text: plan.text, pos });
      report("suggestion");
      return;
    }
    const valid = () => {
      if (ticket !== request || view.isDestroyed || view.composing || !view.hasFocus()) return false;
      const next = blockContext(view);
      return !!next && next.before === context.before && next.after === context.after && view.state.selection.from === pos;
    };
    const show = (result: Completion) => {
      if (!valid()) return;
      const text = prepareGhost(plan.prefixLine, result.text, result.truncated);
      setGhost(view, text ? { text, pos } : null);
      report(text ? "suggestion" : "idle");
    };
    const key = JSON.stringify([current.host, current.model, plan.prompt]);
    const cached = cache.get(key);
    if (cached) { show(cached); return; }
    const active = new AbortController();
    controller = active;
    report("loading");
    try {
      const result = await current.complete(plan.prompt, active.signal, (text) => {
        // Show complete words while the remaining tokens are still arriving.
        if (prepareGhost(plan.prefixLine, text, true)) show({ text, truncated: true });
      });
      if (!valid()) return;
      if (result.text) {
        cache.set(key, result);
        if (cache.size > 24) cache.delete(cache.keys().next().value!);
      }
      show(result);
    } catch (error) {
      if (active.signal.aborted || !valid()) return;
      setGhost(view, null);
      report("error", error instanceof Error ? error.message : String(error));
    } finally {
      if (controller === active) controller = null;
    }
  };

  const schedule = (view: EditorView) => {
    cancel();
    report("idle");
    setGhost(view, null);
    if (!bridge.current.enabled || !view.hasFocus() || view.composing) return;
    const context = blockContext(view);
    const plan = context && completionPlan({ ...context, enabled: true, model: bridge.current.model });
    if (!plan) return;
    const ticket = request;
    if (plan.kind === "local" || cache.has(JSON.stringify([bridge.current.host, bridge.current.model, plan.prompt]))) {
      void run(view, ticket); return;
    }
    timer = setTimeout(() => { timer = undefined; void run(view, ticket); }, 140);
  };

  return new Plugin<Ghost>({
    key: ghostKey,
    state: {
      init: () => null,
      apply(tr, previous) {
        const meta = tr.getMeta(ghostKey);
        if (meta !== undefined) return meta as Ghost;
        if (previous && tr.docChanged && tr.steps.length === 1) {
          const step = tr.steps[0];
          if (step instanceof ReplaceStep && step.from === previous.pos && step.to === step.from &&
            step.slice.openStart === 0 && step.slice.openEnd === 0 && tr.selection.empty) {
            const inserted = step.slice.content.textBetween(0, step.slice.content.size, "", "\ufffc");
            if (inserted && inserted.length === step.slice.size && previous.text.startsWith(inserted) &&
              tr.selection.from === previous.pos + inserted.length) {
              const text = previous.text.slice(inserted.length);
              return text ? { text, pos: tr.selection.from } : null;
            }
          }
        }
        if (tr.docChanged || tr.selectionSet) return null;
        return previous;
      },
    },
    props: {
      handleDOMEvents: {
        focus(view) { schedule(view); return false; },
        blur(view) { cancel(); setGhost(view, null); if (lastStatus !== "error") report("idle"); return false; },
        compositionstart(view) { cancel(); setGhost(view, null); report("idle"); return false; },
        compositionend(view) {
          // ProseMirror releases its composing flag shortly after the DOM event.
          cancel();
          timer = setTimeout(() => schedule(view), 60);
          return false;
        },
      },
      decorations(state) {
        const ghost = ghostKey.getState(state);
        if (!ghost?.text) return null;
        return DecorationSet.create(state.doc, [Decoration.widget(ghost.pos, () => {
          const span = document.createElement("span");
          span.className = "ghost-text";
          span.textContent = ghost.text;
          return span;
        }, { side: 1 })]);
      },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing) return false;
        const ghost = ghostKey.getState(view.state);
        if (event.key === "Escape" && (ghost || controller || timer)) {
          event.preventDefault(); cancel(); setGhost(view, null); report("idle"); return true;
        }
        if (ghost?.text && event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          cancel();
          view.dispatch(view.state.tr.insertText(ghost.text, ghost.pos).setMeta(ghostKey, null).scrollIntoView());
          return true;
        }
        return false;
      },
    },
    view(view) {
      // Restored/autofocused editors may never receive another focus event.
      schedule(view);
      return {
        update(view, previous) {
          const configChanged = bridge.current.enabled !== lastEnabled || bridge.current.model !== lastModel || bridge.current.host !== lastHost;
          if (view.state.doc.eq(previous.doc) && view.state.selection.eq(previous.selection) && !configChanged) return;
          lastEnabled = bridge.current.enabled; lastModel = bridge.current.model; lastHost = bridge.current.host;
          if (!configChanged && ghostKey.getState(view.state)) { cancel(); report("suggestion"); return; }
          schedule(view);
        },
        destroy() { cancel(); cache.clear(); report("idle"); },
      };
    },
  });
}

export function autocomplete(bridge: { current: CompleteBridge }) {
  return $prose(() => createAutocompletePlugin(bridge));
}
