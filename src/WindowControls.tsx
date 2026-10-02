import { useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./vault-api";

// Also mounted inside the active dialog's top layer. Native buttons must not be
// descendants of an inert workspace or sit behind a dialog backdrop.
export function WindowControls({ hidden = false }: { hidden?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  if (!isTauri() || hidden) return null;
  const appWindow = getCurrentWindow();
  const run = (action: () => Promise<void>) => {
    setError(null);
    void action().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  return <div className="window-controls app-header-windows" role="group" aria-label="Window controls">
    <button type="button" aria-label="Minimize" title="Minimize" onClick={() => run(() => appWindow.minimize())}><Minus aria-hidden /></button>
    <button type="button" aria-label="Maximize or restore" title="Maximize or restore" onClick={() => run(() => appWindow.toggleMaximize())}><Square aria-hidden /></button>
    <button type="button" className="close" aria-label="Close" title="Close" onClick={() => run(() => appWindow.close())}><X aria-hidden /></button>
    {error ? <p className="window-control-error" role="alert">{error}</p> : null}
  </div>;
}
