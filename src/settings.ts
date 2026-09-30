import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from "./appearance";

export type Settings = Appearance & {
  vault: string;
  ollamaHost: string;
  model: string;
  editModel: string;
  autocomplete: boolean;
  appearanceRev: 2;
};

const STORAGE_KEY = "notes-settings";

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_APPEARANCE,
  vault: "",
  ollamaHost: "http://127.0.0.1:11434",
  model: "",
  editModel: "",
  autocomplete: false,
  appearanceRev: 2,
};

type StoredSettings = Omit<Partial<Settings>, "appearanceRev"> & { appearanceRev?: number };

export function normalizeSettings(parsed: StoredSettings | null | undefined): Settings {
  const appearance = normalizeAppearance(parsed);
  const rev = parsed?.appearanceRev ?? 0;
  return {
    ...appearance,
    appearanceRev: 2,
    font: rev < 1 && appearance.font === "system" ? "roboto" : appearance.font,
    contentWidth:
      rev < 2 && (appearance.contentWidth === "narrow" || (rev < 1 && appearance.contentWidth === "full"))
        ? "comfortable"
        : appearance.contentWidth,
    vault: typeof parsed?.vault === "string" ? parsed.vault : "",
    ollamaHost:
      typeof parsed?.ollamaHost === "string" && parsed.ollamaHost.trim()
        ? parsed.ollamaHost.trim()
        : DEFAULT_SETTINGS.ollamaHost,
    model: typeof parsed?.model === "string" ? parsed.model : "",
    editModel: typeof parsed?.editModel === "string" ? parsed.editModel : "",
    autocomplete: parsed?.autocomplete === true,
  };
}

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
