import { Minus, Settings, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./vault-api";

export function AppHeader({ title, onSettings }: { title: string; onSettings: () => void }) {
  return (
    <header className="app-header" data-tauri-drag-region>
      <div className="app-header-brand" data-tauri-drag-region>
        Notes
      </div>
      <div className="app-header-rule" data-tauri-drag-region aria-hidden />
      <div className="app-header-tab" title={title}>
        <span>{title}</span>
      </div>
      <div className="app-header-spacer" data-tauri-drag-region />
      <button type="button" className="app-header-icon" title="Settings" aria-label="Settings" onClick={onSettings}>
        <Settings aria-hidden />
      </button>
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
