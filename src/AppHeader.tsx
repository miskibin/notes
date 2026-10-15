import { ArrowLeft, CodeXml, FolderOpen, History, Link2, TableOfContents } from "lucide-react";
import { isTauri } from "./vault-api";

export function AppHeader({
  title,
  screen,
  onNavigate,
  sourceMode,
  onToggleSource,
  onReference,
  onHistory,
  outline,
  onToggleOutline,
  onReveal,
}: {
  title: string;
  screen: "notes" | "settings";
  onNavigate: (screen: "notes" | "settings") => void;
  sourceMode: boolean;
  onToggleSource: () => void;
  onReference: () => void;
  onHistory: () => void;
  /** Undefined hides the button: the note has too few headings. */
  outline?: boolean;
  onToggleOutline: () => void;
  onReveal?: () => void;
}) {
  return (
    <header className="app-header" data-tauri-drag-region>
      {screen === "settings" ? (
        <button type="button" className="app-header-mode" aria-label="Back to notes" title="Back to notes" onClick={() => onNavigate("notes")}>
          <ArrowLeft aria-hidden />
        </button>
      ) : null}
      {screen === "notes" && title ? (
        <div className="app-header-title" title={title} data-tauri-drag-region>
          <span data-tauri-drag-region>{title}</span>
        </div>
      ) : <span className="app-header-page" data-tauri-drag-region>{screen === "settings" ? "Settings" : ""}</span>}
      <div className="app-header-spacer" data-tauri-drag-region />
      {screen === "notes" ? (
        <>
        {outline !== undefined ? <button type="button" className="app-header-mode" aria-label="Outline" aria-pressed={outline} title="Outline" onClick={onToggleOutline}><TableOfContents aria-hidden /></button> : null}
        {onReveal ? <button type="button" className="app-header-mode" aria-label="Show in folder" title="Show in folder" onClick={onReveal}><FolderOpen aria-hidden /></button> : null}
        <button type="button" className="app-header-mode" aria-label="Add reference" title="Add reference (Ctrl+Shift+L)" onClick={onReference}><Link2 aria-hidden /></button>
        <button type="button" className="app-header-mode" aria-label="History and recovery" title="History and recovery" onClick={onHistory}><History aria-hidden /></button>
        <button type="button" className="app-header-mode" aria-label="Markdown source" aria-pressed={sourceMode}
          title={`${sourceMode ? "Live preview" : "Markdown source"} (Ctrl+Shift+M)`} onClick={onToggleSource}>
          <CodeXml aria-hidden />
        </button>
        </>
      ) : null}
      {isTauri() ? <div className="window-controls-slot" data-tauri-drag-region aria-hidden /> : null}
    </header>
  );
}
