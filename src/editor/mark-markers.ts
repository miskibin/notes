import type { Mark, Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { syncNativeCaret } from "./rendered-nodes";

// Formatting markers (~~, **, *, `) are drawn by CSS, so they cannot be
// deleted one character at a time. Deleting next to an outer marker turns the
// formatted run back into literal Markdown minus that one character; typing
// the character again restores the formatting through the input rule.
export function markerText(mark: Mark): string | null {
  const marker = typeof mark.attrs.marker === "string" ? mark.attrs.marker : "*";
  switch (mark.type.name) {
    case "strike_through": return "~~";
    case "strong": return marker.repeat(2);
    case "emphasis": return marker;
    case "inlineCode": return "`";
    default: return null;
  }
}

function runAround(parent: ProseNode, start: number, index: number, mark: Mark): { from: number; to: number } {
  let from = start, to = start, offset = 0;
  let first = index, last = index;
  while (first > 0 && mark.isInSet(parent.child(first - 1).marks)) first--;
  while (last < parent.childCount - 1 && mark.isInSet(parent.child(last + 1).marks)) last++;
  parent.forEach((child, _pos, i) => {
    if (i === first) from = start + offset;
    offset += child.nodeSize;
    if (i === last) to = start + offset;
  });
  return { from, to };
}

export function deleteMarker(state: EditorState, key: "Backspace" | "Delete"): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const $pos = selection.$from;
  if (!$pos.parent.inlineContent || $pos.parent.type.spec.code) return null;
  const before = $pos.nodeBefore, after = $pos.nodeAfter;
  const active = state.storedMarks ?? $pos.marks();
  for (const node of key === "Backspace" ? [before, after] : [after, before]) {
    if (!node?.isText) continue;
    for (const mark of node.marks) {
      const marker = markerText(mark);
      if (!marker) continue;
      const atEnd = node === before && !mark.isInSet(after?.marks ?? []);
      const atStart = node === after && !mark.isInSet(before?.marks ?? []);
      if (!atEnd && !atStart) continue;
      const inside = !!mark.isInSet(active);
      // The visible character next to the caret must be this run's marker.
      const closing = key === "Backspace" ? atEnd && !inside : atEnd && inside;
      const opening = key === "Backspace" ? atStart && inside : atStart && !inside;
      if (!closing && !opening) continue;
      const index = node === before ? $pos.index() - 1 : $pos.index();
      const { from, to } = runAround($pos.parent, $pos.start(), index, mark);
      const marks = mark.removeFromSet(node.marks);
      const open = closing ? marker : key === "Backspace" ? marker.slice(0, -1) : marker.slice(1);
      const close = opening ? marker : key === "Backspace" ? marker.slice(0, -1) : marker.slice(1);
      const tr = state.tr.removeMark(from, to, mark);
      if (close) tr.insert(to, state.schema.text(close, marks));
      if (open) tr.insert(from, state.schema.text(open, marks));
      const caret = closing ? (key === "Backspace" ? to + open.length + close.length : to + open.length)
        : (key === "Backspace" ? from + open.length : from);
      return tr.setSelection(TextSelection.create(tr.doc, caret)).setStoredMarks(marks).scrollIntoView();
    }
  }
  return null;
}

export const markerDeletion = $prose(() => new Plugin({
  props: {
    handleDOMEvents: {
      // Runs before keymaps, including Milkdown's undoInputRule on Backspace.
      keydown(view, event) {
        if (!view.editable || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        syncNativeCaret(view);
        const tr = deleteMarker(view.state, event.key);
        if (!tr) return false;
        event.preventDefault();
        view.dispatch(tr);
        return true;
      },
    },
  },
}));
