import { useRef, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, Copy, ClipboardPaste, Scissors, TextSelect } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { EditorHandle, EditorHandleRef, EditorSelection } from "./editor-handle";
import { writeClipboard } from "./shortcuts";

export function EditorContextMenu({ children, editorHandle, onVisualize }: {
  children: ReactNode;
  editorHandle: EditorHandleRef;
  onVisualize: (selection: EditorSelection) => void;
}) {
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const launching = useRef(false);
  const capturedHandle = useRef(editorHandle.current);
  const replace = (text: string, handle: EditorHandle | null) => {
    if (!selection || !handle || editorHandle.current !== handle) throw new Error("The note changed. Select the current text again.");
    handle.replaceSelection(text, selection);
  };
  const report = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
  return (
    <ContextMenu onOpenChange={(open) => {
      if (open) { launching.current = false; capturedHandle.current = editorHandle.current; setError(null); setSelection(editorHandle.current?.getSelection(true) ?? null); }
    }}>
      <ContextMenuTrigger asChild>
        <div className="editor-context-region" onKeyDown={(event) => {
          if (event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
            const current = editorHandle.current?.getSelection();
            if (current) { event.preventDefault(); onVisualize(current); }
          }
        }}>{children}{error ? <p className="context-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></p> : null}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="editor-context-menu" onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!launching.current) editorHandle.current?.focus();
      }}>
        <ContextMenuItem disabled={!selection?.text.trim()} onSelect={() => {
          if (!selection) return;
          launching.current = true;
          onVisualize(selection);
        }}><ChartNoAxesCombined aria-hidden="true" /> Visualize <span className="context-shortcut">Ctrl+Alt+V</span></ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!selection || selection.from === selection.to} onSelect={() => {
          const handle = capturedHandle.current;
          if (selection) void writeClipboard(selection.text).then((copied) => {
            if (!copied) throw new Error("Could not copy. Use Ctrl+X in the editor.");
            replace("", handle);
          }).catch(report);
        }}><Scissors aria-hidden="true" /> Cut <span className="context-shortcut">Ctrl+X</span></ContextMenuItem>
        <ContextMenuItem disabled={!selection || selection.from === selection.to} onSelect={() => {
          if (selection) void writeClipboard(selection.text).then((copied) => { if (!copied) report("Could not copy. Use Ctrl+C in the editor."); });
        }}><Copy aria-hidden="true" /> Copy <span className="context-shortcut">Ctrl+C</span></ContextMenuItem>
        <ContextMenuItem disabled={!selection} onSelect={() => {
          const handle = capturedHandle.current;
          if (!navigator.clipboard?.readText) { report("Use Ctrl+V to paste in the editor."); return; }
          void navigator.clipboard.readText().then((text) => { if (text) replace(text, handle); }).catch(report);
        }}><ClipboardPaste aria-hidden="true" /> Paste <span className="context-shortcut">Ctrl+V</span></ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editorHandle.current?.selectAll()}><TextSelect aria-hidden="true" /> Select all <span className="context-shortcut">Ctrl+A</span></ContextMenuItem>
        {!selection?.text.trim() ? <p className="context-hint">Select text to visualize an idea.</p> : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
