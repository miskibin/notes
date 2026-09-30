import { ArrowLeft, CodeXml, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./vault-api";

export function AppHeader({
  title,
  screen,
  onNavigate,
  sourceMode,
  onToggleSource,
}: {
  title: string;
  screen: "notes" | "settings";
  onNavigate: (screen: "notes" | "settings") => void;
  sourceMode: boolean;
  onToggleSource: () => void;
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
          <span>{title}</span>
        </div>
      ) : <span className="app-header-page" data-tauri-drag-region>{screen === "settings" ? "Settings" : ""}</span>}
      <div className="app-header-spacer" data-tauri-drag-region />
      {screen === "notes" ? (
        <button type="button" className="app-header-mode" aria-label="Markdown source" aria-pressed={sourceMode}
          title={`${sourceMode ? "Live preview" : "Markdown source"} (Ctrl+Shift+M)`} onClick={onToggleSource}>
          <CodeXml aria-hidden />
        </button>
      ) : null}
      {isTauri() ? <WindowControls /> : null}
    </header>
  );
}

function WindowControls() {
  const appWindow = getCurrentWindow();
  return (
    <div className="app-header-windows">
      <button type="button" aria-label="Minimize" onClick={() => void appWindow.minimize()}>
        <Minus aria-hidden />
      </button>
      <button type="button" aria-label="Maximize" onClick={() => void appWindow.toggleMaximize()}>
        <Square aria-hidden />
      </button>
      <button type="button" className="close" aria-label="Close" onClick={() => void appWindow.close()}>
        <X aria-hidden />
      </button>
    </div>
  );
}
