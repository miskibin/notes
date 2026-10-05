import type { Node as ProseNode, NodeSpec } from "@milkdown/kit/prose/model";
import { AllSelection, Plugin, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { boundarySelection } from "./rendered-nodes";

export function mathSource(value: string, display: boolean): string {
  return display ? `$$\n${value}\n$$` : `$${value}$`;
}

export function mathValue(source: string, display: boolean): string | null {
  if (display) {
    if (source.length < 4 || !source.startsWith("$$") || !source.endsWith("$$")) return null;
    return source.slice(2, -2).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  }
  if (source.length < 2 || !source.startsWith("$") || !source.endsWith("$") || source.includes("\n")) return null;
  if (source.startsWith("$$") || source.endsWith("$$")) return null;
  return source.slice(1, -1);
}

export function isMath(node: ProseNode): boolean {
  return node.type.name === "math_inline" || node.type.name === "math_block";
}

export function mathSpec(display: boolean): NodeSpec {
  const tag = display ? "div" : "span";
  const name = display ? "math-block" : "math-inline";
  return {
    group: display ? "block" : "inline",
    inline: !display,
    atom: !display,
    content: "text*",
    marks: "",
    code: true,
    isolating: display,
    defining: true,
    createGapCursor: display,
    parseDOM: [{ tag: `${tag}[data-type="${name}"]`, preserveWhitespace: "full", contentElement: ".math-source" }],
    toDOM: () => [tag, { "data-type": name }, [tag, { class: "math-source" }, 0]],
  };
}

export function mathSelectionTouches(state: EditorState, pos: number, node: ProseNode): boolean {
  if (!(state.selection instanceof TextSelection || state.selection instanceof AllSelection)) return false;
  const { from, to } = state.selection;
  return from <= pos + node.nodeSize - 1 && to >= pos + 1;
}

export function syncMathSelection(view: EditorView): boolean {
  const native = view.dom.ownerDocument.getSelection();
  if (!native?.anchorNode || !native.focusNode || !view.dom.contains(native.anchorNode) || !view.dom.contains(native.focusNode) ||
    !native.anchorNode.parentElement?.closest(".math-source")) return false;
  const anchor = view.posAtDOM(native.anchorNode, native.anchorOffset);
  const head = view.posAtDOM(native.focusNode, native.focusOffset);
  if (anchor !== view.state.selection.anchor || head !== view.state.selection.head) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
  }
  return true;
}

// A damaged fence stays editable while the cursor is inside. Leaving it
// turns it into ordinary text, preserving everything the user typed.
export function mathEditingPlugin(): Plugin {
  let cachedState: EditorState | undefined;
  let cachedDecorations: DecorationSet;
  return new Plugin({
    props: {
      decorations(state) {
        if (cachedState && state.doc === cachedState.doc && state.selection.eq(cachedState.selection)) return cachedDecorations;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!isMath(node)) return;
          const value = mathValue(node.textContent, node.isBlock);
          const fence = node.isBlock ? 2 : 1;
          const contentStart = pos + 1;
          if (value != null) {
            decorations.push(Decoration.inline(contentStart, contentStart + fence, { class: "markdown-syntax" }));
            decorations.push(Decoration.inline(contentStart + node.content.size - fence, contentStart + node.content.size, { class: "markdown-syntax" }));
          }
          if (mathSelectionTouches(state, pos, node) || value == null || !value.trim()) {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "math-editing" }));
          } else {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { contenteditable: "false" }));
          }
          return false;
        });
        cachedState = state;
        cachedDecorations = DecorationSet.create(state.doc, decorations);
        return cachedDecorations;
      },
      handleKeyDown(view, event) {
        if (event.isComposing) return false;
        // Native selectionchange may arrive after a rapid Shift+arrow followed
        // by Backspace. Respect the visible selection rather than joining blocks.
        if (syncMathSelection(view)) {
          if (!view.state.selection.empty && (event.key === "Backspace" || event.key === "Delete")) {
            view.dispatch(view.state.tr.deleteSelection());
            return true;
          }
        }
        const { $from, empty } = view.state.selection;
        const node = $from.parent;
        if (!isMath(node)) return false;
        const atEnd = $from.parentOffset === node.content.size;
        const exit = event.key === "Escape" ||
          (empty && event.key === "Enter" && !event.shiftKey && (!node.isBlock || atEnd));
        if (exit) {
          let tr = view.state.tr;
          const after = $from.after();
          if (node.isBlock && after === tr.doc.content.size) {
            tr = tr.insert(after, view.state.schema.nodes.paragraph!.create());
          }
          const selection = boundarySelection({ doc: tr.doc }, after, 1);
          view.dispatch(tr.setSelection(selection).scrollIntoView());
          return true;
        }
        if (empty && event.key === "Enter" && node.isBlock) {
          view.dispatch(view.state.tr.insertText("\n").scrollIntoView());
          return true;
        }
        return false;
      },
    },
    appendTransaction(transactions, _previous, state) {
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
      const invalid: { pos: number; node: ProseNode }[] = [];
      state.doc.descendants((node, pos) => {
        if (!isMath(node)) return;
        if (!mathSelectionTouches(state, pos, node) && mathValue(node.textContent, node.isBlock) == null) invalid.push({ pos, node });
        return false;
      });
      if (!invalid.length) return null;
      const tr = state.tr;
      for (const { pos, node } of invalid.reverse()) {
        const content = node.textContent ? state.schema.text(node.textContent) : undefined;
        const replacement = node.isBlock ? state.schema.nodes.paragraph!.create(null, content) : content;
        if (replacement) tr.replaceWith(pos, pos + node.nodeSize, replacement);
        else tr.delete(pos, pos + node.nodeSize);
      }
      return tr;
    },
  });
}
