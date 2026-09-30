import { parserCtx } from "@milkdown/kit/core";
import { Slice } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { looksLikeMarkdown } from "./text";

export const markdownPaste = $prose((ctx) => {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data) return false;
        if (Array.from(data.files).some((file) => file.type.startsWith("image/"))) return false;
        const text = data.getData("text/plain");
        if (!looksLikeMarkdown(text)) return false;
        try {
          const parsed = ctx.get(parserCtx)(text);
          if (!parsed.childCount) return false;
          const { selection } = view.state;
          let tr = view.state.tr;
          const inline =
            parsed.childCount === 1 && parsed.firstChild?.type.name === "paragraph"
              ? parsed.firstChild.content
              : null;
          if (inline) {
            tr = tr.replaceSelection(new Slice(inline, 0, 0));
          } else if (selection.$from.depth === 0) {
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
      },
    },
  });
});
