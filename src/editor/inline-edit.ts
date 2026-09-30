import { parserCtx } from "@milkdown/kit/core";
import { Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { CompleteBridge } from "./autocomplete";
import { cleanEdit, editAsMarkdown } from "./text";

type Range = { from: number; to: number };
type Session = Range & { text: string };

const editKey = new PluginKey<Range | null>("note-inline-edit");

function leafText(node: ProseNode): string {
  if (node.type.name === "math_inline" || node.type.name === "math_block") return node.textContent;
  return "";
}

function selectedText(doc: ProseNode, from: number, to: number): string {
  return doc.textBetween(from, to, "\n\n", leafText);
}

function rangeDecorations(doc: ProseNode, from: number, to: number): Decoration[] {
  const marks: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + node.nodeSize - 1);
    if (end > start) marks.push(Decoration.inline(start, end, { class: "inline-edit-range" }));
  });
  return marks;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong";
}

function place(panel: HTMLElement, view: EditorView, pos: number): void {
  let top = 72;
  let left = 72;
  try {
    const coords = view.coordsAtPos(Math.max(1, Math.min(pos, view.state.doc.content.size)));
    const width = panel.offsetWidth || 420;
    const height = panel.offsetHeight || 48;
    top = coords.bottom + 8;
    left = coords.left;
    if (top + height > window.innerHeight - 8) top = Math.max(8, coords.top - height - 8);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  } catch {
    // The selection is offscreen; keep the panel in the viewport.
  }
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

function applyReplacement(
  view: EditorView,
  from: number,
  to: number,
  original: string,
  text: string,
  parse: (markdown: string) => ProseNode,
): boolean {
  if (selectedText(view.state.doc, from, to) !== original) return false;
  const $from = view.state.doc.resolve(from);
  const $to = view.state.doc.resolve(to);
  const inCode =
    $from.sameParent($to) &&
    Boolean($from.parent.type.spec.code);
  if (!inCode && editAsMarkdown(text)) {
    try {
      const parsed = parse(text);
      if (parsed.childCount) {
        const insideText = $from.sameParent($to) && $from.parent.isTextblock;
        const onlyParagraph = parsed.childCount === 1 && parsed.firstChild?.type.name === "paragraph";
        const slice =
          insideText && onlyParagraph && parsed.firstChild
            ? new Slice(parsed.firstChild.content, 0, 0)
            : parsed.slice(0);
        const tr = view.state.tr
          .setSelection(TextSelection.create(view.state.doc, from, to))
          .replaceSelection(slice)
          .scrollIntoView()
          .setMeta(editKey, null);
        view.dispatch(tr);
        return true;
      }
    } catch {
      // The rewrite is still usable as plain text.
    }
  }
  view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView().setMeta(editKey, null));
  return true;
}

export function inlineEdit(bridge: { current: CompleteBridge }) {
  return $prose((ctx) => {
    let session: Session | null = null;
    let panel: HTMLFormElement | null = null;
    let ticket = 0;
    let applying = false;
    let onDocPointer: ((event: MouseEvent) => void) | null = null;
    let onScroll: (() => void) | null = null;

    const teardownPanel = () => {
      panel?.remove();
      panel = null;
      if (onDocPointer) document.removeEventListener("mousedown", onDocPointer, true);
      if (onScroll) {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      }
      onDocPointer = null;
      onScroll = null;
    };

    const close = (view: EditorView | null) => {
      ticket += 1;
      session = null;
      teardownPanel();
      if (view && !view.isDestroyed && editKey.getState(view.state)) {
        view.dispatch(view.state.tr.setMeta(editKey, null));
      }
    };

    const open = (view: EditorView): boolean => {
      if (view.composing) return false;
      const { from, to } = view.state.selection;
      if (from === to) {
        const wasOpen = panel != null;
        if (wasOpen) close(view);
        return wasOpen;
      }
      const text = selectedText(view.state.doc, from, to);
      if (!text.trim()) return false;
      close(view);
      session = { from, to, text };
      view.dispatch(view.state.tr.setMeta(editKey, { from, to }));

      const form = document.createElement("form");
      form.className = "inline-edit";
      form.setAttribute("role", "dialog");
      form.setAttribute("aria-label", "Edit selection");
      const row = document.createElement("div");
      row.className = "inline-edit-row";
      const input = document.createElement("input");
      input.spellcheck = false;
      input.type = "text";
      input.placeholder = "popraw gramatykę";
      input.setAttribute("aria-label", "Instruction");
      input.autocomplete = "off";
      input.maxLength = 500;
      const button = document.createElement("button");
      button.type = "submit";
      button.className = "primary";
      button.textContent = "Apply";
      const status = document.createElement("p");
      status.className = "inline-edit-status";
      status.hidden = true;
      row.append(input, button);
      form.append(row, status);
      document.body.append(form);
      panel = form;

      const showStatus = (message: string, error = false) => {
        status.hidden = message.length === 0;
        status.textContent = message;
        status.classList.toggle("error", error);
        if (session) place(form, view, session.to);
      };

      onScroll = () => {
        if (session) place(form, view, session.to);
      };
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      onDocPointer = (event: MouseEvent) => {
        if (form.contains(event.target as Node | null)) return;
        close(view);
      };
      document.addEventListener("mousedown", onDocPointer, true);

      form.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(view);
          view.focus();
        }
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const current = session;
        if (!current || input.disabled) return;
        const instruction = input.value.trim();
        if (!instruction) return;
        if (!bridge.current.editModel.trim()) {
          showStatus("Pick an edit model in Settings.", true);
          return;
        }
        const requestId = ticket;
        input.disabled = true;
        button.disabled = true;
        showStatus("Working…");
        void bridge.current
          .edit(instruction, current.text)
          .then((raw) => {
            if (requestId !== ticket || session !== current) return;
            const cleaned = cleanEdit(raw);
            if (!cleaned) {
              showStatus("The model returned nothing.", true);
              input.disabled = false;
              button.disabled = false;
              input.focus();
              return;
            }
            applying = true;
            let replaced = false;
            try {
              replaced = applyReplacement(view, current.from, current.to, current.text, cleaned, (markdown) =>
                ctx.get(parserCtx)(markdown),
              );
            } finally {
              applying = false;
            }
            if (!replaced) {
              showStatus("The selection changed.", true);
              input.disabled = false;
              button.disabled = false;
              input.focus();
              return;
            }
            session = null;
            teardownPanel();
            view.focus();
          })
          .catch((error: unknown) => {
            if (requestId !== ticket) return;
            showStatus(errorText(error), true);
            input.disabled = false;
            button.disabled = false;
            input.focus();
          });
      });

      place(form, view, to);
      requestAnimationFrame(() => input.focus());
      return true;
    };

    return new Plugin<Range | null>({
      key: editKey,
      state: {
        init: () => null,
        apply(tr, previous) {
          const meta = tr.getMeta(editKey);
          if (meta !== undefined) return meta as Range | null;
          if (!previous) return null;
          if (tr.docChanged) return null;
          return {
            from: tr.mapping.map(previous.from),
            to: tr.mapping.map(previous.to),
          };
        },
      },
      props: {
        decorations(state) {
          const range = editKey.getState(state);
          if (!range) return null;
          const marks = rangeDecorations(state.doc, range.from, range.to);
          return marks.length ? DecorationSet.create(state.doc, marks) : null;
        },
      },
      view(editorView) {
        const onKey = (event: KeyboardEvent) => {
          if (event.code !== "KeyE" || event.altKey || event.shiftKey || event.isComposing) return;
          if (!event.ctrlKey && !event.metaKey) return;
          if (!open(editorView)) return;
          event.preventDefault();
          event.stopPropagation();
        };
        editorView.dom.addEventListener("keydown", onKey, true);
        return {
          update(view, previous) {
            if (applying || !session) return;
            if (!view.state.doc.eq(previous.doc) || !view.state.selection.eq(previous.selection)) close(view);
            else if (panel) place(panel, view, session.to);
          },
          destroy() {
            editorView.dom.removeEventListener("keydown", onKey, true);
            close(null);
          },
        };
      },
    });
  });
}
