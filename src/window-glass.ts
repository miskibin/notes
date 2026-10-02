import { useEffect, useState } from "react";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { resolvedColorMode, type ColorMode } from "./appearance";
import { isTauri } from "./vault-api";

type GlassAdapter = { apply: (dark: boolean) => Promise<void>; clear: () => Promise<void> };

// Serialize native effects; a late enable must never undo a newer disable.
export function createGlassController(adapter: GlassAdapter, surface: (enabled: boolean) => void) {
  let queue = Promise.resolve(), revision = 0, dirty = false;
  return { request(enabled: boolean, dark: boolean): Promise<string | null> {
    const ticket = ++revision;
    surface(false); // Keep text and surfaces opaque until the native effect succeeds.
    const result = queue.then(async () => {
      if (ticket !== revision) return null;
      try {
        if (enabled) { dirty = true; await adapter.apply(dark); }
        else if (dirty) { await adapter.clear(); dirty = false; }
        if (ticket === revision) surface(enabled);
        return null;
      } catch (cause) {
        try { await adapter.clear(); dirty = false; } catch { /* Opaque fallback even if OS cleanup fails. */ }
        if (ticket === revision) surface(false);
        return `Frosted glass unavailable: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
    });
    queue = result.then(() => {});
    return result;
  } };
}

export function useWindowGlass(enabled: boolean, colorMode: ColorMode): string | null {
  const [status, setStatus] = useState<string | null>(null);
  const [controller] = useState(() => createGlassController({
    apply: async dark => {
      const window = getCurrentWindow();
      await window.setShadow(false);
      await window.setEffects({ effects: [Effect.Acrylic], color: dark ? [21, 23, 25, 170] : [246, 248, 250, 170] });
    },
    clear: async () => {
      const window = getCurrentWindow();
      try { await window.clearEffects(); } finally { await window.setShadow(true); }
    },
  }, active => { document.documentElement.dataset.frostedGlass = String(active); }));
  useEffect(() => {
    if (!isTauri() || !/Win/i.test(navigator.userAgent)) {
      document.documentElement.dataset.frostedGlass = "false";
      setStatus(enabled ? "Available in the Windows desktop app. This window stays opaque." : null);
      return;
    }
    let active = true;
    const update = () => {
      void controller.request(enabled, resolvedColorMode(colorMode) === "dark").then(error => { if (active) setStatus(error); });
    };
    update();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (colorMode === "system") media.addEventListener("change", update);
    return () => { active = false; media.removeEventListener("change", update); void controller.request(false, false); };
  }, [enabled, colorMode, controller]);
  return status;
}
