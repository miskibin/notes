import { useEffect, useRef } from "react";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import type { EditorHandle, EditorHandleRef } from "./editor-handle";
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
    const handle: EditorHandle = { getMarkdown: () => view.state.doc.toString(), replaceMarkdown: (next: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next },
        annotations: [isolateHistory.of("full"), Transaction.userEvent.of("input.format")] });
      view.focus();
    },
      getSelection: (includeEmpty = false) => {
        const { from, to } = view.state.selection.main;
        const text = view.state.sliceDoc(from, to);
        return includeEmpty || text.trim() ? { text, from, to, document: view.state.doc.toString() } : null;
      },
      replaceSelection: (text, selection) => {
        if (view.state.doc.toString() !== selection.document) throw new Error("The note changed. Select the current text again.");
        const insert = text.replace(/\r\n?/g, "\n");
        view.dispatch({ changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length }, annotations: isolateHistory.of("full") });
        view.focus();
      },
      selectAll: () => { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); },
      insertAfterSelection: (next, selection) => {
        if (view.state.doc.toString() !== selection.document) throw new Error("The note changed. Visualize the current selection again.");
        const at = view.state.doc.lineAt(selection.to).to;
        const insert = `\n\n${next.trim()}\n\n`;
        view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length },
          annotations: [isolateHistory.of("full"), Transaction.userEvent.of("input.visualize")] });
        view.focus();
      },
      focus: () => view.focus(),
      revealText: (text) => {
        const at = view.state.doc.toString().toLocaleLowerCase().indexOf(text.toLocaleLowerCase());
        if (at < 0) return;
        view.dispatch({ selection: { anchor: at, head: at + text.length }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
        view.focus();
      },
    };
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
