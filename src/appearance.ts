export const COLOR_MODES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
] as const;

export const UI_FONTS = [
  { id: "system", label: "System" },
  { id: "roboto", label: "Roboto" },
  { id: "inter", label: "Inter" },
  { id: "ibm-plex", label: "IBM Plex Sans" },
  { id: "figtree", label: "Figtree" },
  { id: "geist", label: "Geist" },
] as const;

export const UI_MONO_FONTS = [
  { id: "match", label: "Match UI" },
  { id: "system", label: "System Mono" },
  { id: "roboto-mono", label: "Roboto Mono" },
  { id: "jetbrains", label: "JetBrains Mono" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono" },
  { id: "geist-mono", label: "Geist Mono" },
] as const;

export const UI_FONT_SIZES = [
  { id: "compact", label: "Compact" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
] as const;

export const UI_FONT_WEIGHTS = [
  { id: "light", label: "Light" },
  { id: "regular", label: "Regular" },
  { id: "medium", label: "Medium" },
  { id: "semibold", label: "Semibold" },
  { id: "bold", label: "Bold" },
] as const;

export const UI_DENSITIES = [
  { id: "compact", label: "Compact" },
  { id: "default", label: "Default" },
  { id: "comfortable", label: "Comfortable" },
] as const;

export const UI_RADII = [
  { id: "sharp", label: "Sharp" },
  { id: "default", label: "Default" },
  { id: "rounded", label: "Rounded" },
] as const;

export const CONTENT_WIDTHS = [
  { id: "narrow", label: "Narrow" },
  { id: "comfortable", label: "Comfortable" },
  { id: "full", label: "Full" },
] as const;

export type ColorMode = (typeof COLOR_MODES)[number]["id"];
export type UiFont = (typeof UI_FONTS)[number]["id"];
export type UiMonoFont = (typeof UI_MONO_FONTS)[number]["id"];
export type UiFontSize = (typeof UI_FONT_SIZES)[number]["id"];
export type UiFontWeight = (typeof UI_FONT_WEIGHTS)[number]["id"];
export type UiDensity = (typeof UI_DENSITIES)[number]["id"];
export type UiRadius = (typeof UI_RADII)[number]["id"];
export type ContentWidth = (typeof CONTENT_WIDTHS)[number]["id"];
export type PaletteId =
  | "ink"
  | "primer"
  | "catppuccin"
  | "supabase"
  | "northern-lights"
  | "vercel"
  | "clay"
  | "kraft"
  | "azure"
  | "graphite";

export type Appearance = {
  colorMode: ColorMode;
  palette: PaletteId;
  font: UiFont;
  mono: UiMonoFont;
  fontSize: UiFontSize;
  fontWeight: UiFontWeight;
  density: UiDensity;
  radius: UiRadius;
  contentWidth: ContentWidth;
  reduceMotion: boolean;
  textZoom: number;
};

export const DEFAULT_APPEARANCE: Appearance = {
  colorMode: "dark",
  palette: "ink",
  font: "roboto",
  mono: "match",
  fontSize: "default",
  fontWeight: "regular",
  density: "default",
  radius: "default",
  contentWidth: "comfortable",
  reduceMotion: false,
  textZoom: 1,
};

type Surface = {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
};

type Palette = {
  id: PaletteId;
  label: string;
  description: string;
  light: Surface;
  dark: Surface;
};

function surface(
  tokens: Omit<Surface, "sidebar" | "sidebarForeground" | "sidebarAccent" | "sidebarAccentForeground" | "sidebarBorder">,
  accent?: Pick<Surface, "sidebarAccent" | "sidebarAccentForeground">,
): Surface {
  return {
    ...tokens,
    sidebar: tokens.background,
    sidebarForeground: tokens.foreground,
    sidebarAccent: accent?.sidebarAccent ?? tokens.muted,
    sidebarAccentForeground: accent?.sidebarAccentForeground ?? tokens.foreground,
    sidebarBorder: tokens.border,
  };
}

export const PALETTES: Palette[] = [
  {
    id: "ink",
    label: "Ink",
    description: "Neutral notes",
    light: surface(
      {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.32 0 0)",
        card: "oklch(1 0 0)",
        primary: "oklch(0.62 0.19 259.81)",
        primaryForeground: "oklch(1 0 0)",
        muted: "oklch(0.98 0 247.84)",
        mutedForeground: "oklch(0.55 0.02 264.36)",
        border: "oklch(0.93 0.01 264.53)",
      },
      {
        sidebarAccent: "oklch(0.95 0.03 236.82)",
        sidebarAccentForeground: "oklch(0.38 0.14 265.52)",
      },
    ),
    dark: surface(
      {
        background: "oklch(0.2 0 0)",
        foreground: "oklch(0.92 0 0)",
        card: "oklch(0.27 0 0)",
        primary: "oklch(0.62 0.19 259.81)",
        primaryForeground: "oklch(1 0 0)",
        muted: "oklch(0.27 0 0)",
        mutedForeground: "oklch(0.72 0 0)",
        border: "oklch(0.37 0 0)",
      },
      {
        sidebarAccent: "oklch(0.38 0.14 265.52)",
        sidebarAccentForeground: "oklch(0.88 0.06 254.13)",
      },
    ),
  },
  {
    id: "primer",
    label: "Primer",
    description: "GitHub-inspired",
    light: surface({
      background: "#f6f8fa",
      foreground: "#1f2328",
      card: "#ffffff",
      primary: "#0969da",
      primaryForeground: "#ffffff",
      muted: "#eaeef2",
      mutedForeground: "#656d76",
      border: "#d0d7de",
    }),
    dark: surface({
      background: "#0d1117",
      foreground: "#e6edf3",
      card: "#161b22",
      primary: "#2f81f7",
      primaryForeground: "#ffffff",
      muted: "#21262d",
      mutedForeground: "#9198a1",
      border: "#30363d",
    }),
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    description: "Soft mauve",
    light: surface({
      background: "oklch(0.96 0.01 264.53)",
      foreground: "oklch(0.44 0.04 279.33)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.55 0.25 297.02)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.91 0.01 264.51)",
      mutedForeground: "oklch(0.55 0.03 279.08)",
      border: "oklch(0.81 0.02 271.2)",
    }),
    dark: surface({
      background: "oklch(0.22 0.03 284.06)",
      foreground: "oklch(0.88 0.04 272.28)",
      card: "oklch(0.24 0.03 283.91)",
      primary: "oklch(0.79 0.12 304.77)",
      primaryForeground: "oklch(0.24 0.03 283.91)",
      muted: "oklch(0.3 0.03 276.21)",
      mutedForeground: "oklch(0.75 0.04 273.93)",
      border: "oklch(0.32 0.03 281.98)",
    }),
  },
  {
    id: "supabase",
    label: "Supabase",
    description: "Emerald",
    light: surface({
      background: "oklch(0.9911 0 0)",
      foreground: "oklch(0.2046 0 0)",
      card: "oklch(0.9911 0 0)",
      primary: "oklch(0.8348 0.1302 160.908)",
      primaryForeground: "oklch(0.2626 0.0147 166.4589)",
      muted: "oklch(0.9461 0 0)",
      mutedForeground: "oklch(0.2435 0 0)",
      border: "oklch(0.9037 0 0)",
    }),
    dark: surface({
      background: "oklch(0.1822 0 0)",
      foreground: "oklch(0.9288 0.0126 255.5078)",
      card: "oklch(0.2046 0 0)",
      primary: "oklch(0.4365 0.1044 156.7556)",
      primaryForeground: "oklch(0.9213 0.0135 167.1556)",
      muted: "oklch(0.2393 0 0)",
      mutedForeground: "oklch(0.7122 0 0)",
      border: "oklch(0.2809 0 0)",
    }),
  },
  {
    id: "northern-lights",
    label: "Northern Lights",
    description: "Aurora",
    light: surface({
      background: "oklch(0.98 0 286)",
      foreground: "oklch(0.32 0 0)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.58 0.14 150)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.94 0.02 98)",
      mutedForeground: "oklch(0.5 0 0)",
      border: "oklch(0.87 0 0)",
    }),
    dark: surface({
      background: "oklch(0.23 0.01 264)",
      foreground: "oklch(0.92 0 0)",
      card: "oklch(0.28 0.015 240)",
      primary: "oklch(0.7 0.14 150)",
      primaryForeground: "oklch(0.18 0.02 150)",
      muted: "oklch(0.32 0.01 260)",
      mutedForeground: "oklch(0.72 0 0)",
      border: "oklch(0.38 0.01 260)",
    }),
  },
  {
    id: "vercel",
    label: "Vercel",
    description: "High-contrast mono",
    light: surface({
      background: "oklch(0.99 0 0)",
      foreground: "oklch(0.05 0 0)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.15 0 0)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.96 0 0)",
      mutedForeground: "oklch(0.4 0 0)",
      border: "oklch(0.88 0 0)",
    }),
    dark: surface({
      background: "oklch(0 0 0)",
      foreground: "oklch(0.98 0 0)",
      card: "oklch(0.12 0 0)",
      primary: "oklch(0.98 0 0)",
      primaryForeground: "oklch(0.05 0 0)",
      muted: "oklch(0.2 0 0)",
      mutedForeground: "oklch(0.7 0 0)",
      border: "oklch(0.26 0 0)",
    }),
  },
  {
    id: "clay",
    label: "Clay",
    description: "Warm parchment",
    light: surface({
      background: "oklch(0.9529 0.0146 102.4597)",
      foreground: "oklch(0.4063 0.0255 40.3627)",
      card: "oklch(0.985 0.008 102)",
      primary: "oklch(0.6083 0.0623 44.3588)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.8502 0.0389 49.0874)",
      mutedForeground: "oklch(0.5416 0.0512 37.2132)",
      border: "oklch(0.7473 0.0387 80.5476)",
    }),
    dark: surface({
      background: "oklch(0.2721 0.0141 48.1783)",
      foreground: "oklch(0.9529 0.0146 102.4597)",
      card: "oklch(0.3291 0.0156 50.8936)",
      primary: "oklch(0.7272 0.0539 52.332)",
      primaryForeground: "oklch(0.2721 0.0141 48.1783)",
      muted: "oklch(0.4063 0.0255 40.3627)",
      mutedForeground: "oklch(0.7575 0.038 50.861)",
      border: "oklch(0.4063 0.0255 40.3627)",
    }),
  },
  {
    id: "kraft",
    label: "Kraft",
    description: "Warm paper",
    light: surface({
      background: "oklch(0.9195 0.0169 88.003)",
      foreground: "oklch(0.235 0 0)",
      card: "oklch(0.953 0.0156 86.4257)",
      primary: "oklch(0.3012 0 0)",
      primaryForeground: "oklch(0.9169 0.0175 99.616)",
      muted: "oklch(0.834 0.0232 87.163)",
      mutedForeground: "oklch(0.4688 0.0136 84.5932)",
      border: "oklch(0.8434 0.0231 87.1621)",
    }),
    dark: surface({
      background: "oklch(0.1913 0 0)",
      foreground: "oklch(0.9173 0.0133 82.4015)",
      card: "oklch(0.2264 0 0)",
      primary: "oklch(0.852 0.0205 100.6306)",
      primaryForeground: "oklch(0.3329 0 0)",
      muted: "oklch(0.285 0 0)",
      mutedForeground: "oklch(0.6348 0.0113 81.7875)",
      border: "oklch(0.2931 0 0)",
    }),
  },
  {
    id: "azure",
    label: "Azure",
    description: "Cool blue",
    light: surface({
      background: "oklch(0.9581 0 0)",
      foreground: "oklch(0.3134 0.0234 253.627)",
      card: "oklch(0.9774 0.0042 236.4961)",
      primary: "oklch(0.6112 0.1217 248.9572)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.9209 0.0128 244.2626)",
      mutedForeground: "oklch(0.6027 0.0062 211.0375)",
      border: "oklch(0.884 0.0067 208.7806)",
    }),
    dark: surface({
      background: "oklch(0.1776 0 0)",
      foreground: "oklch(0.7905 0.0126 259.8241)",
      card: "oklch(0.2638 0.0024 247.9155)",
      primary: "oklch(0.6576 0.1208 252.0832)",
      primaryForeground: "oklch(1 0 0)",
      muted: "oklch(0.2171 0.0025 247.9411)",
      mutedForeground: "oklch(0.7559 0.0125 239.9659)",
      border: "oklch(0.3506 0.0066 248.0169)",
    }),
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Quiet zinc",
    light: surface({
      background: "oklch(0.985 0.002 247)",
      foreground: "oklch(0.21 0.006 286)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.21 0.006 286)",
      primaryForeground: "oklch(0.985 0.002 247)",
      muted: "oklch(0.967 0.001 286)",
      mutedForeground: "oklch(0.552 0.016 286)",
      border: "oklch(0.92 0.004 286)",
    }),
    dark: surface({
      background: "oklch(0.141 0.005 286)",
      foreground: "oklch(0.985 0.002 247)",
      card: "oklch(0.21 0.006 286)",
      primary: "oklch(0.92 0.004 286)",
      primaryForeground: "oklch(0.21 0.006 286)",
      muted: "oklch(0.274 0.006 286)",
      mutedForeground: "oklch(0.705 0.015 286)",
      border: "oklch(0.274 0.006 286)",
    }),
  },
];

const ids = <T extends string>(items: readonly { id: T }[]) => new Set<string>(items.map((item) => item.id));

const COLOR_MODE_IDS = ids(COLOR_MODES);
const FONT_IDS = ids(UI_FONTS);
const MONO_IDS = ids(UI_MONO_FONTS);
const SIZE_IDS = ids(UI_FONT_SIZES);
const WEIGHT_IDS = ids(UI_FONT_WEIGHTS);
const DENSITY_IDS = ids(UI_DENSITIES);
const RADIUS_IDS = ids(UI_RADII);
const WIDTH_IDS = ids(CONTENT_WIDTHS);
const PALETTE_IDS = new Set<string>(PALETTES.map((palette) => palette.id));

function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

export function normalizeAppearance(value: Partial<Appearance> | null | undefined): Appearance {
  return {
    colorMode: oneOf(value?.colorMode, COLOR_MODE_IDS, DEFAULT_APPEARANCE.colorMode),
    palette: oneOf(value?.palette, PALETTE_IDS, DEFAULT_APPEARANCE.palette),
    font: oneOf(value?.font, FONT_IDS, DEFAULT_APPEARANCE.font),
    mono: oneOf(value?.mono, MONO_IDS, DEFAULT_APPEARANCE.mono),
    fontSize: oneOf(value?.fontSize, SIZE_IDS, DEFAULT_APPEARANCE.fontSize),
    fontWeight: oneOf(value?.fontWeight, WEIGHT_IDS, DEFAULT_APPEARANCE.fontWeight),
    density: oneOf(value?.density, DENSITY_IDS, DEFAULT_APPEARANCE.density),
    radius: oneOf(value?.radius, RADIUS_IDS, DEFAULT_APPEARANCE.radius),
    contentWidth: oneOf(value?.contentWidth, WIDTH_IDS, DEFAULT_APPEARANCE.contentWidth),
    reduceMotion: value?.reduceMotion === true,
    textZoom: clampTextZoom(value?.textZoom),
  };
}

export function clampTextZoom(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 1;
  const stepped = Math.round(number * 10) / 10;
  return Math.min(1.6, Math.max(0.7, stepped));
}

export function stepTextZoom(current: number, direction: -1 | 0 | 1): number {
  if (direction === 0) return 1;
  return clampTextZoom(current + direction * 0.1);
}

export function paletteById(id: PaletteId): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function resolvedColorMode(mode: ColorMode): "light" | "dark" {
  if (mode !== "system" || typeof window === "undefined") return mode === "light" ? "light" : "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  const mode = resolvedColorMode(appearance.colorMode);
  const tokens = paletteById(appearance.palette)[mode];
  root.dataset.colorMode = mode;
  root.dataset.palette = appearance.palette;
  root.dataset.uiFont = appearance.font;
  root.dataset.uiMono = appearance.mono;
  root.dataset.uiFontSize = appearance.fontSize;
  root.dataset.uiFontWeight = appearance.fontWeight;
  root.dataset.density = appearance.density;
  root.dataset.radius = appearance.radius;
  root.dataset.contentWidth = appearance.contentWidth;
  root.dataset.reduceMotion = appearance.reduceMotion ? "true" : "false";
  root.style.colorScheme = mode;
  root.classList.toggle("dark", mode === "dark");
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  set("--background", tokens.background);
  set("--foreground", tokens.foreground);
  set("--card", tokens.card);
  set("--card-foreground", tokens.foreground);
  set("--popover", tokens.card);
  set("--popover-foreground", tokens.foreground);
  set("--primary", tokens.primary);
  set("--primary-foreground", tokens.primaryForeground);
  set("--secondary", tokens.muted);
  set("--secondary-foreground", tokens.foreground);
  set("--muted", tokens.muted);
  set("--muted-foreground", tokens.mutedForeground);
  set("--accent", tokens.sidebarAccent);
  set("--accent-foreground", tokens.sidebarAccentForeground);
  set("--border", tokens.border);
  set("--input", tokens.border);
  set("--ring", tokens.primary);
  set("--sidebar", tokens.sidebar);
  set("--sidebar-foreground", tokens.sidebarForeground);
  set("--sidebar-primary", tokens.primary);
  set("--sidebar-primary-foreground", tokens.primaryForeground);
  set("--sidebar-accent", tokens.sidebarAccent);
  set("--sidebar-accent-foreground", tokens.sidebarAccentForeground);
  set("--sidebar-border", tokens.sidebarBorder);
  set("--sidebar-ring", tokens.primary);
  set("--bg", tokens.background);
  set("--fg", tokens.foreground);
  set("--ui-zoom", String(appearance.textZoom));
  set("--ui-scale", String(appearance.textZoom));
  if (appearance.textZoom === 1) delete root.dataset.textZoom;
  else root.dataset.textZoom = "on";
  set("--header", mode === "light" ? `color-mix(in oklch, ${tokens.foreground} 6%, ${tokens.background})` : tokens.background);
  set("--header-tab", tokens.card);
  set("--header-foreground", tokens.foreground);
  set("--header-muted", tokens.mutedForeground);
  set("--header-close-hover", "#da3633");
}
