import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";

const WORD = /[\p{L}\p{N}_]/u;

type Span = { from: number; to: number; code: boolean };

export function wordTouching(text: string, offset: number): { from: number; to: number } | null {
  const isWord = (index: number) => index >= 0 && index < text.length && WORD.test(text[index] ?? "");
  let anchor = offset;
  if (!isWord(anchor)) {
    if (!isWord(anchor - 1)) return null;
    anchor -= 1;
  }
  let from = anchor;
  let to = anchor + 1;
  while (isWord(from - 1)) from -= 1;
  while (isWord(to)) to += 1;
  return from < to ? { from, to } : null;
}

export function deleteWordRange(text: string, offset: number, dir: -1 | 1): { from: number; to: number } | null {
  if (dir < 0) {
    if (offset <= 0) return null;
    const word = wordTouching(text, offset);
    if (word && offset > word.from && offset <= word.to) return { from: word.from, to: offset };
    let index = offset;
    while (index > 0 && /\s/.test(text[index - 1] ?? "")) index -= 1;
    if (index === offset) {
      const current = wordTouching(text, offset);
      if (!current) return null;
    }
    const previous = wordTouching(text, index);
    return { from: previous ? previous.from : index, to: offset };
  }
  if (offset >= text.length) return null;
  const word = wordTouching(text, offset);
  if (word && offset >= word.from && offset < word.to) return { from: offset, to: word.to };
  let index = offset;
  while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
  const next = wordTouching(text, index);
  if (!next) return index > offset ? { from: offset, to: index } : null;
  return { from: offset, to: next.to };
}

export function lineIndexAt(text: string, offset: number): { index: number; column: number } {
  const lines = text.split("\n");
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (offset <= cursor + line.length || index === lines.length - 1) {
      return { index, column: Math.max(0, Math.min(offset - cursor, line.length)) };
    }
    cursor += line.length + 1;
  }
  return { index: 0, column: 0 };
}

function offsetOf(lines: string[], index: number, column: number): number {
  let cursor = 0;
  for (let i = 0; i < index; i += 1) cursor += (lines[i]?.length ?? 0) + 1;
  return cursor + column;
}

export function moveTextLine(
  text: string,
  offset: number,
  dir: -1 | 1,
): { text: string; offset: number } | null {
  const lines = text.split("\n");
  const place = lineIndexAt(text, offset);
  const target = place.index + dir;
  if (target < 0 || target >= lines.length) return null;
  const next = lines.slice();
  const [line] = next.splice(place.index, 1);
  next.splice(target, 0, line ?? "");
  return {
    text: next.join("\n"),
    offset: offsetOf(next, target, Math.min(place.column, (line ?? "").length)),
  };
}

export function duplicateTextLine(
  text: string,
  offset: number,
  dir: -1 | 1,
): { text: string; offset: number } {
  const lines = text.split("\n");
  const place = lineIndexAt(text, offset);
  const line = lines[place.index] ?? "";
  const next = lines.slice();
  const insertAt = dir > 0 ? place.index + 1 : place.index;
  next.splice(insertAt, 0, line);
  return { text: next.join("\n"), offset: offsetOf(next, insertAt, Math.min(place.column, line.length)) };
}

export function deleteTextLine(text: string, offset: number): { text: string; offset: number } {
  const lines = text.split("\n");
  const place = lineIndexAt(text, offset);
  if (lines.length === 1) return { text: "", offset: 0 };
  const next = lines.slice();
  next.splice(place.index, 1);
  const index = Math.min(place.index, next.length - 1);
  return { text: next.join("\n"), offset: offsetOf(next, index, 0) };
}

export function insertTextLine(
  text: string,
  offset: number,
  dir: -1 | 1,
): { text: string; offset: number } {
  const lines = text.split("\n");
  const place = lineIndexAt(text, offset);
  const next = lines.slice();
  const insertAt = dir > 0 ? place.index + 1 : place.index;
  next.splice(insertAt, 0, "");
  return { text: next.join("\n"), offset: offsetOf(next, insertAt, 0) };
}

function unitDepth($pos: EditorState["selection"]["$from"]): number | null {
  let depth = 0;
  for (let level = $pos.depth; level > 0; level -= 1) {
    const node = $pos.node(level);
    if (node.isTextblock || node.type.name === "math_block") {
      depth = level;
      break;
    }
  }
  if (!depth) return null;
  while (depth > 1) {
    const parent = $pos.node(depth - 1);
    const liftable = parent.childCount === 1 && (parent.type.name === "list_item" || parent.type.name === "blockquote");
    if (!liftable) break;
    depth -= 1;
  }
  return depth;
}

function lineSpan(state: EditorState): Span | null {
  const { selection, doc } = state;
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    return { from: selection.from, to: selection.to, code: false };
  }
  const $from = selection.$from;
  const $to = selection.$to;
  if ($from.parent.type.name === "code_block" && $from.sameParent($to)) {
    return { from: $from.start(), to: $from.end(), code: true };
  }
  const fromDepth = unitDepth($from);
  const toDepth = unitDepth($to);
  if (!fromDepth || !toDepth || fromDepth !== toDepth) return null;
  const from = Math.min($from.before(fromDepth), $to.before(toDepth));
  const to = Math.max($from.after(fromDepth), $to.after(toDepth));
  if (doc.resolve(from).parent !== doc.resolve(Math.max(from, to - 1)).parent && from !== to) {
    const endParent = doc.resolve(to).parent;
    if (doc.resolve(from).parent !== endParent) return null;
  }
  return { from, to, code: false };
}

function placeCaret(tr: Transaction, pos: number): Transaction {
  const clamped = Math.max(0, Math.min(pos, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(tr.doc.resolve(clamped))).scrollIntoView();
}

function replaceCode(state: EditorState, span: Span, next: { text: string; offset: number }): Transaction {
  const tr = state.tr.insertText(next.text, span.from, span.to);
  return placeCaret(tr, span.from + next.offset);
}

function codeOffset(state: EditorState, span: Span): number {
  return Math.max(0, Math.min(state.selection.from, span.to) - span.from);
}

export function moveLine(state: EditorState, dir: -1 | 1): Transaction | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    const moved = moveTextLine(text, codeOffset(state, span), dir);
    return moved ? replaceCode(state, span, moved) : null;
  }
  if (dir < 0) {
    const previous = state.doc.resolve(span.from).nodeBefore;
    if (!previous) return null;
    const previousFrom = span.from - previous.nodeSize;
    const slice = state.doc.slice(span.from, span.to);
    const cursor = state.selection.from - span.from;
    const tr = state.tr.delete(span.from, span.to).insert(previousFrom, slice.content);
    return placeCaret(tr, previousFrom + cursor);
  }
  const next = state.doc.resolve(span.to).nodeAfter;
  if (!next) return null;
  const slice = state.doc.slice(span.from, span.to);
  const cursor = state.selection.from - span.from;
  const tr = state.tr.delete(span.from, span.to);
  const insertAt = span.from + next.nodeSize;
  tr.insert(insertAt, slice.content);
  return placeCaret(tr, insertAt + cursor);
}

export function duplicateLine(state: EditorState, dir: -1 | 1): Transaction | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    return replaceCode(state, span, duplicateTextLine(text, codeOffset(state, span), dir));
  }
  const slice = state.doc.slice(span.from, span.to);
  const cursor = state.selection.from - span.from;
  if (dir > 0) {
    const tr = state.tr.insert(span.to, slice.content);
    return placeCaret(tr, span.to + cursor);
  }
  const tr = state.tr.insert(span.from, slice.content);
  return placeCaret(tr, span.from + cursor);
}

function expandCoveredParents(doc: ProseNode, from: number, to: number): { from: number; to: number } {
  let span = { from, to };
  for (let guard = 0; guard < 8; guard += 1) {
    const $from = doc.resolve(span.from);
    if ($from.depth === 0) break;
    const $to = doc.resolve(span.to);
    if ($to.parent !== $from.parent) break;
    if ($from.parentOffset !== 0 || $to.parentOffset !== $from.parent.content.size) break;
    const next = { from: $from.before($from.depth), to: $from.after($from.depth) };
    if (next.from === span.from && next.to === span.to) break;
    span = next;
  }
  return span;
}

export function deleteLine(state: EditorState): Transaction | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    return replaceCode(state, span, deleteTextLine(text, codeOffset(state, span)));
  }
  const covered = expandCoveredParents(state.doc, span.from, span.to);
  const coversDoc = covered.from === 0 && covered.to === state.doc.content.size;
  const paragraph = state.schema.nodes.paragraph;
  const tr = coversDoc && paragraph
    ? state.tr.replaceWith(0, state.doc.content.size, paragraph.create())
    : state.tr.delete(covered.from, covered.to);
  try {
    tr.doc.check();
  } catch {
    if (!paragraph) return null;
    const fallback = state.tr.replaceWith(span.from, span.to, paragraph.create());
    return placeCaret(fallback, span.from + 1);
  }
  return placeCaret(tr, Math.min(covered.from + 1, tr.doc.content.size));
}

function emptySibling(node: ProseNode): ProseNode {
  const paragraph = node.type.schema.nodes.paragraph;
  if (node.type.name === "list_item" && paragraph) return node.type.create(null, paragraph.create());
  if (node.type.name === "blockquote" && paragraph) return node.type.create(null, paragraph.create());
  if (node.isTextblock) return node.type.create();
  return paragraph ? paragraph.create() : node.type.create();
}

export function insertLine(state: EditorState, dir: -1 | 1): Transaction | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    return replaceCode(state, span, insertTextLine(text, codeOffset(state, span), dir));
  }
  const block = state.doc.nodeAt(span.from);
  if (!block) return null;
  const created = emptySibling(block);
  const at = dir > 0 ? span.to : span.from;
  const tr = state.tr.insert(at, created);
  return placeCaret(tr, at + 1);
}

export function selectWord(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.$from.parent.isTextblock) return null;
  const text = selection.$from.parent.textContent;
  let word = wordTouching(text, selection.$from.parentOffset);
  if (!word) {
    const rest = text.slice(selection.$from.parentOffset);
    const found = rest.search(new RegExp(WORD.source, "u"));
    if (found >= 0) word = wordTouching(text, selection.$from.parentOffset + found);
  }
  if (!word) return null;
  const start = selection.$from.start();
  return state.tr.setSelection(TextSelection.create(state.doc, start + word.from, start + word.to)).scrollIntoView();
}

export function selectLine(state: EditorState): Transaction | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    const place = lineIndexAt(text, codeOffset(state, span));
    const lines = text.split("\n");
    const from = span.from + offsetOf(lines, place.index, 0);
    const to = from + (lines[place.index]?.length ?? 0);
    return state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView();
  }
  const $from = state.doc.resolve(span.from);
  const insideFrom = span.from + 1;
  const insideTo = Math.max(insideFrom, span.to - 1);
  if ($from.nodeAfter?.isTextblock) {
    return state.tr.setSelection(TextSelection.create(state.doc, insideFrom, insideTo)).scrollIntoView();
  }
  return state.tr.setSelection(NodeSelection.create(state.doc, span.from)).scrollIntoView();
}

export function deleteWord(state: EditorState, dir: -1 | 1): Transaction | null {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;
  const text = selection.$from.parent.textContent;
  const range = deleteWordRange(text, selection.$from.parentOffset, dir);
  if (!range) return null;
  const start = selection.$from.start();
  return state.tr.delete(start + range.from, start + range.to).scrollIntoView();
}

export function clipboardText(state: EditorState): string | null {
  if (!state.selection.empty) return null;
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    const place = lineIndexAt(text, codeOffset(state, span));
    return `${text.split("\n")[place.index] ?? ""}\n`;
  }
  const $from = state.selection.$from;
  if ($from.parent.isTextblock) {
    const word = wordTouching($from.parent.textContent, $from.parentOffset);
    if (word) return $from.parent.textContent.slice(word.from, word.to);
  }
  const text = state.doc.textBetween(span.from, span.to, "\n\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

export async function writeClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    try { await clipboard.writeText(text); return true; } catch { /* use the WebView fallback */ }
  }
  return writeClipboardFallback(text);
}

function writeClipboardFallback(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.append(area);
  area.select();
  try { return document.execCommand("copy"); }
  catch { return false; }
  finally { area.remove(); }
}

function mod(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function typingTarget(event: KeyboardEvent, view: EditorView): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target === view.dom) return false;
  return target.closest("input, textarea, select") != null;
}

function dispatch(view: EditorView, tr: Transaction | null): boolean {
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}

export function editorShortcuts() {
  return $prose(() => {
    return new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.isComposing || typingTarget(event, view)) return false;
          const altArrow = event.altKey && !mod(event) && (event.key === "ArrowUp" || event.key === "ArrowDown");
          if (altArrow) {
            const dir = event.key === "ArrowUp" ? -1 : 1;
            const tr = event.shiftKey ? duplicateLine(view.state, dir) : moveLine(view.state, dir);
            if (!tr && !lineSpan(view.state)) return false;
            if (tr) view.dispatch(tr);
            return true;
          }
          if (mod(event) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
            return dispatch(view, deleteLine(view.state));
          }
          if (mod(event) && !event.altKey && event.key === "Enter") {
            return dispatch(view, insertLine(view.state, event.shiftKey ? -1 : 1));
          }
          if (mod(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "d") {
            return dispatch(view, selectWord(view.state));
          }
          if (mod(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "l") {
            return dispatch(view, selectLine(view.state));
          }
          if (mod(event) && !event.altKey && event.key === "Backspace") {
            return dispatch(view, deleteWord(view.state, -1));
          }
          if (mod(event) && !event.altKey && event.key === "Delete") {
            return dispatch(view, deleteWord(view.state, 1));
          }
          if (mod(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "c" && view.state.selection.empty) {
            const text = clipboardText(view.state);
            if (text == null) return false;
            writeClipboard(text);
            return true;
          }
          if (mod(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "x" && view.state.selection.empty) {
            const text = lineForCut(view.state);
            if (text == null) return false;
            writeClipboard(text);
            return dispatch(view, deleteLine(view.state));
          }
          return false;
        },
      },
    });
  });
}

function lineForCut(state: EditorState): string | null {
  const span = lineSpan(state);
  if (!span) return null;
  if (span.code) {
    const text = state.doc.textBetween(span.from, span.to, "\n", "\n");
    const place = lineIndexAt(text, codeOffset(state, span));
    return `${text.split("\n")[place.index] ?? ""}\n`;
  }
  const text = state.doc.textBetween(span.from, span.to, "\n\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}
