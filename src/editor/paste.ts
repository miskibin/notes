import { parserCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { closeHistory } from "@milkdown/kit/prose/history";
import { looksLikeMarkdown } from "./text";
import { syncMathSelection } from "./math-document";
import { normalizePastedMath } from "./math-paste";

// Install as a direct view prop, before Milkdown's HTML clipboard plugin.
// Browser copies (including ChatGPT) usually provide both HTML and plain text.
export function markdownPaste(ctx: Ctx) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const data = event.clipboardData;
    if (!data) return false;
    if (Array.from(data.files).some((file) => file.type.startsWith("image/"))) return false;
    let text = data.getData("text/plain");
    syncMathSelection(view);
    if (text && (view.state.selection.$from.parent.type.spec.code ||
      view.state.selection.$from.marks().some((mark) => mark.type.spec.code))) {
      view.dispatch(closeHistory(view.state.tr.insertText(text)).setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView());
      return true;
    }
    text = normalizePastedMath(text);
    if (!looksLikeMarkdown(text)) return false;
    try {
      const parsed = ctx.get(parserCtx)(text);
      if (!parsed.childCount) return false;
      const { selection } = view.state;
      let tr = closeHistory(view.state.tr).setMeta("paste", true).setMeta("uiEvent", "paste");
      const inline =
        parsed.childCount === 1 && parsed.firstChild?.type.name === "paragraph"
          ? parsed.firstChild.content
          : null;
      if (inline) {
        tr = tr.replaceSelection(new Slice(inline, 0, 0));
      } else if (!selection.empty || selection.$from.depth === 0) {
        tr = tr.replaceSelection(parsed.slice(0));
      } else {
        let depth = selection.$from.depth;
        while (depth > 1) depth -= 1;
        const $from = selection.$from;
        const after = $from.after(depth);
        const block = $from.node(depth);
        const replaceEmpty =
          selection.empty && block.type.name === "paragraph" && block.textContent.trim() === "";
        tr = replaceEmpty
          ? tr.replaceWith($from.before(depth), after, parsed.content)
          : tr.insert(after, parsed.content);
      }
      view.dispatch(tr.scrollIntoView());
      return true;
    } catch {
      return false;
    }
  };
}
