import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import type { EditorHandleRef } from "./editor-handle";
import { sourceSyntax } from "./source-syntax";

export function SourceCanvas({ noteKey, markdown, onChange, editorHandle }: {
  noteKey: string;
  markdown: string;
  onChange: (markdown: string) => void;
  editorHandle: EditorHandleRef;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: markdown,
        extensions: [
          history(), markdownLanguage(), syntaxHighlighting(defaultHighlightStyle), sourceSyntax,
          EditorView.lineWrapping,
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.contentAttributes.of({ "aria-label": "Markdown source", spellcheck: "false" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    const handle = { getMarkdown: () => view.state.doc.toString() };
    editorHandle.current = handle;
    view.focus();
    return () => {
      if (editorHandle.current === handle) editorHandle.current = null;
      viewRef.current = null;
      view.destroy();
    };
    // This editor owns the document until the note changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, editorHandle]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== markdown) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: markdown } });
    }
  }, [markdown]);

  return <div className="source-canvas" ref={host} />;
}
