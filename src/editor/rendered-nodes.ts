import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { GapCursor } from "@milkdown/kit/prose/gapcursor";
import { NodeSelection, Plugin, Selection, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export function isRenderedNode(node: ProseNode | null | undefined): boolean {
  return !!node && ["math_inline", "math_block", "chart_block", "image-block"].includes(node.type.name);
}

export function boundarySelection(state: EditorState, pos: number, side: -1 | 1): Selection {
  const $pos = state.doc.resolve(pos);
  if ($pos.parent.inlineContent) return TextSelection.create(state.doc, pos);
  const closed = (node: ProseNode | null) => !node || node.isAtom || isRenderedNode(node) || !node.inlineContent;
  if (closed($pos.nodeBefore) && closed($pos.nodeAfter)) return new GapCursor($pos);
  // A neighboring paragraph already provides a normal writing position.
  return Selection.near($pos, side);
}

export function renderedNodeKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  if (!view.editable || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (target && target instanceof Element && target.closest("input, textarea, select, button")) return false;
  // Native Home/End motion can precede selectionchange.
  // Read the visible caret before deciding whether a neighboring object is hit.
  if ((event.key === "Backspace" || event.key === "Delete") && view.dom &&
    view.state.selection instanceof TextSelection && view.state.selection.empty) {
    const native = view.dom.ownerDocument.getSelection();
    if (native?.anchorNode && native.focusNode && view.dom.contains(native.anchorNode) && view.dom.contains(native.focusNode) &&
      !native.anchorNode.parentElement?.closest('[contenteditable="false"]') &&
      !native.focusNode.parentElement?.closest('[contenteditable="false"]')) {
      const anchor = view.posAtDOM(native.anchorNode, native.anchorOffset);
      const head = view.posAtDOM(native.focusNode, native.focusOffset);
      if (anchor !== view.state.selection.anchor || head !== view.state.selection.head) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
      }
    }
  }
  const { state } = view;
  const { selection } = state;
  const dir = ["ArrowLeft", "ArrowUp", "Backspace"].includes(event.key) ? -1 :
    ["ArrowRight", "ArrowDown", "Delete"].includes(event.key) ? 1 : 0;
  const deleting = event.key === "Backspace" || event.key === "Delete";
  if (selection instanceof NodeSelection && isRenderedNode(selection.node)) {
    if (deleting) {
      view.dispatch(state.tr.deleteSelection().scrollIntoView());
      return true;
    }
    if (dir) {
      view.dispatch(state.tr.setSelection(boundarySelection(state, dir < 0 ? selection.from : selection.to, dir)).scrollIntoView());
      return true;
    }
  }
  if (selection instanceof GapCursor && event.key === "Enter") {
    const tr = state.tr.insert(selection.from, state.schema.nodes.paragraph!.create());
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, selection.from + 1)).scrollIntoView());
    return true;
  }
  if (!dir || !selection.empty) return false;
  const $pos = selection.$from;
  let node = dir < 0 ? $pos.nodeBefore : $pos.nodeAfter;
  let pos = dir < 0 ? $pos.pos - (node?.nodeSize ?? 0) : $pos.pos;
  if ($pos.parent.inlineContent && !isRenderedNode(node)) {
    const edge = dir < 0 ? $pos.parentOffset === 0 : $pos.parentOffset === $pos.parent.content.size;
    if (!edge || $pos.depth === 0) return false;
    const boundary = state.doc.resolve(dir < 0 ? $pos.before() : $pos.after());
    node = dir < 0 ? boundary.nodeBefore : boundary.nodeAfter;
    pos = dir < 0 ? boundary.pos - (node?.nodeSize ?? 0) : boundary.pos;
  }
  if (!isRenderedNode(node)) return false;
  if (node!.isInline && !deleting && event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    const head = dir < 0 ? pos : pos + node!.nodeSize;
    const next = TextSelection.create(state.doc, event.shiftKey ? selection.anchor : head, head);
    view.dispatch(state.tr.setSelection(next).scrollIntoView());
  } else {
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView());
  }
  return true;
}

function cursorEdge(pos: number, side: -1 | 1, block: boolean): Decoration {
  return Decoration.widget(pos, (view) => {
    const dom = document.createElement(block ? "div" : "span");
    dom.className = `rendered-cursor-edge ${block ? "block" : "inline"}-cursor-edge`;
    dom.dataset.side = side < 0 ? "before" : "after";
    dom.setAttribute("aria-hidden", "true");
    dom.addEventListener("mousedown", (event) => {
      const mouse = event as MouseEvent;
      if (!view.editable || mouse.button !== 0 || mouse.shiftKey) return;
      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(boundarySelection(view.state, pos, side)).scrollIntoView());
      view.focus();
    });
    return dom;
  }, { side, key: `rendered-edge-${pos}-${side}`, ignoreSelection: true, stopEvent: () => true });
}

export const renderedNodeNavigation = $prose(() => new Plugin({
  props: {
    handleKeyDown: renderedNodeKeyDown,
    decorations(state) {
      const decorations: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (!isRenderedNode(node)) return;
        decorations.push(cursorEdge(pos, -1, node.isBlock), cursorEdge(pos + node.nodeSize, 1, node.isBlock));
        return false;
      });
      return DecorationSet.create(state.doc, decorations);
    },
    handleClickOn(view, _pos, node, nodePos, event) {
      if (!view.editable || event.button !== 0 || event.shiftKey || !isRenderedNode(node)) return false;
      if (node.type.name === "image-block") return false;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("input, textarea, select, button, .vega-bind, .chart-source, .math-source, .math-fence")) return false;
      // Formula previews enter source editing on click; their empty margins
      // and chart previews select the entire object.
      if (target.closest(".math-rendered")) return false;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
      view.focus();
      return true;
    },
  },
}));
