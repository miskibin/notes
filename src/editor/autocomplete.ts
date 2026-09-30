import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { completionPlan, prepareGhost } from "./text";

export type CompleteBridge = {
  enabled: boolean;
  model: string;
  editModel: string;
  complete: (line: string) => Promise<{ text: string; truncated: boolean }>;
  edit: (instruction: string, text: string) => Promise<string>;
};

type Ghost = { text: string; pos: number } | null;

const ghostKey = new PluginKey<Ghost>("note-ghost");

function blockContext(view: EditorView): { before: string; after: string; code: boolean } | null {
  const selection = view.state.selection;
  if (!selection.empty) return null;
  const parent = selection.$from.parent;
  if (!parent.isTextblock) return null;
  const name = parent.type.name;
  return {
    before: parent.textBetween(0, selection.$from.parentOffset, "\n", "\ufffc"),
    after: parent.textBetween(selection.$from.parentOffset, parent.content.size, "\n", "\ufffc"),
    code: name === "code_block" || name === "code_inline",
  };
}

function setGhost(view: EditorView, ghost: Ghost): void {
  view.dispatch(view.state.tr.setMeta(ghostKey, ghost));
}

export function autocomplete(bridge: { current: CompleteBridge }) {
  return $prose(() => {
    let request = 0;
    let timer = 0;

    const schedule = (view: EditorView) => {
      window.clearTimeout(timer);
      const ticket = ++request;
      timer = window.setTimeout(() => {
        void run(view, ticket);
      }, 220);
    };

    const run = async (view: EditorView, ticket: number) => {
      if (ticket !== request || view.isDestroyed || view.composing) return;
      const context = blockContext(view);
      if (!context) {
        setGhost(view, null);
        return;
      }
      const current = bridge.current;
      const plan = completionPlan({
        before: context.before,
        after: context.after,
        enabled: current.enabled,
        model: current.model,
        code: context.code,
      });
      if (!plan) {
        if (ghostKey.getState(view.state)) setGhost(view, null);
        return;
      }
      const pos = view.state.selection.from;
      if (plan.kind === "local") {
        if (ticket !== request) return;
        setGhost(view, { text: plan.text, pos });
        return;
      }
      let result: { text: string; truncated: boolean };
      try {
        result = await current.complete(plan.prompt);
      } catch {
        if (ticket === request && ghostKey.getState(view.state)) setGhost(view, null);
        return;
      }
      if (ticket !== request || view.isDestroyed) return;
      const next = blockContext(view);
      if (!next || next.before !== context.before || view.state.selection.from !== pos) return;
      const text = prepareGhost(plan.prefixLine, result.text, result.truncated);
      setGhost(view, text ? { text, pos } : null);
    };

    return new Plugin<Ghost>({
      key: ghostKey,
      state: {
        init: () => null,
        apply(tr, previous) {
          const meta = tr.getMeta(ghostKey);
          if (meta !== undefined) return meta as Ghost;
          if (tr.docChanged || tr.selectionSet) return null;
          if (!previous) return null;
          return { text: previous.text, pos: tr.mapping.map(previous.pos) };
        },
      },
      props: {
        decorations(state) {
          const ghost = ghostKey.getState(state);
          if (!ghost?.text) return null;
          const widget = Decoration.widget(
            ghost.pos,
            () => {
              const span = document.createElement("span");
              span.className = "ghost-text";
              span.textContent = ghost.text;
              return span;
            },
            { side: 1 },
          );
          return DecorationSet.create(state.doc, [widget]);
        },
        handleKeyDown(view, event) {
          const ghost = ghostKey.getState(view.state);
          if (!ghost?.text) return false;
          if (event.key === "Escape") {
            event.preventDefault();
            setGhost(view, null);
            return true;
          }
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            const text = ghost.text;
            setGhost(view, null);
            const from = view.state.selection.from;
            view.dispatch(view.state.tr.insertText(text, from).scrollIntoView());
            return true;
          }
          return false;
        },
      },
      view() {
        return {
          update(view, previous) {
            if (view.state.doc.eq(previous.doc) && view.state.selection.eq(previous.selection)) return;
            if (!(view.state.selection instanceof TextSelection)) return;
            schedule(view);
          },
          destroy() {
            window.clearTimeout(timer);
            request += 1;
          },
        };
      },
    });
  });
}
