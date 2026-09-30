import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Columns2,
  FolderOpen,
  Maximize2,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  RotateCcw,
  StickyNote,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_APPEARANCE,
  PALETTES,
  UI_DENSITIES,
  UI_FONT_SIZES,
  UI_FONT_WEIGHTS,
  UI_FONTS,
  UI_MONO_FONTS,
  UI_RADII,
  paletteById,
  resolvedColorMode,
  type Appearance,
} from "./appearance";
import type { Settings } from "./settings";

type Section = "notes" | "appearance" | "files";

const NAV: { id: Section; label: string; icon: typeof StickyNote }[] = [
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "files", label: "Files", icon: FolderOpen },
];

export function SettingsPage({
  settings,
  models,
  modelError,
  onChange,
  onHostBlur,
  onPickFolder,
  onBack,
}: {
  settings: Settings;
  models: string[];
  modelError: string | null;
  onChange: (settings: Settings) => void;
  onHostBlur: () => void;
  onPickFolder: () => void;
  onBack: () => void;
}) {
  const [section, setSection] = useState<Section>("notes");
  const patch = (next: Partial<Settings>) => onChange({ ...settings, ...next });

  return (
    <div className="settings-page mx-auto w-full max-w-5xl px-5 pt-5 pb-16 text-foreground">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Notes, appearance, and files. Changes apply immediately.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Back to notes
        </button>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto md:sticky md:top-3 md:w-48 md:flex-col md:gap-0.5 md:self-start md:rounded-lg md:bg-card md:py-1"
        >
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors md:w-full",
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
                <span className="leading-none">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "notes" ? (
            <NotesSection settings={settings} models={models} modelError={modelError} onChange={patch} onHostBlur={onHostBlur} />
          ) : null}
          {section === "appearance" ? (
            <AppearanceSection appearance={settings} onChange={(next) => patch(next)} onReset={() => patch(DEFAULT_APPEARANCE)} />
          ) : null}
          {section === "files" ? <FilesSection vault={settings.vault} onPickFolder={onPickFolder} /> : null}
        </div>
      </div>
    </div>
  );
}

function NotesSection({
  settings,
  models,
  modelError,
  onChange,
  onHostBlur,
}: {
  settings: Settings;
  models: string[];
  modelError: string | null;
  onChange: (next: Partial<Settings>) => void;
  onHostBlur: () => void;
}) {
  return (
    <div className="space-y-8">
      <SectionHeading title="Notes" description="Local editor. Autocomplete stays off until you turn it on." />
      <Card title="Ollama" description="Address of the local model server. Models are not downloaded from here.">
        <Field id="ollama-host" label="Address" hint="Used by both autocomplete and the edit chat.">
          <input
            id="ollama-host"
            value={settings.ollamaHost}
            spellCheck={false}
            onChange={(event) => onChange({ ollamaHost: event.target.value })}
            onBlur={onHostBlur}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        {modelError ? <p className="text-xs text-destructive">{modelError}</p> : null}
      </Card>
      <PrefSection title="Autocomplete" description="Ghost text continues the current line. Tab accepts it, Esc dismisses it.">
        <PrefRow htmlFor="autocomplete" title="Autocomplete" description="Off by default. Does not call the edit model.">
          <Switch
            id="autocomplete"
            checked={settings.autocomplete}
            onChange={(autocomplete) => onChange({ autocomplete })}
          />
        </PrefRow>
        <PrefRow htmlFor="complete-model" title="Autocomplete model" description="Separate from the model that rewrites a selection.">
          <ModelControl
            id="complete-model"
            models={models}
            value={settings.model}
            onChange={(model) => onChange({ model })}
          />
        </PrefRow>
      </PrefSection>
      <PrefSection title="Edit" description="Select text and press Ctrl+E. The instruction applies only to that selection.">
        <PrefRow htmlFor="edit-model" title="Edit model" description="Left empty, Ctrl+E asks you to pick one instead of reusing autocomplete.">
          <ModelControl
            id="edit-model"
            models={models}
            value={settings.editModel}
            onChange={(editModel) => onChange({ editModel })}
          />
        </PrefRow>
      </PrefSection>
    </div>
  );
}

function AppearanceSection({
  appearance,
  onChange,
  onReset,
}: {
  appearance: Appearance;
  onChange: (next: Partial<Appearance>) => void;
  onReset: () => void;
}) {
  const mode = resolvedColorMode(appearance.colorMode);
  return (
    <div className="space-y-8">
      <SectionHeading title="Appearance" description="Theme, type, density, and the note column. Changes apply immediately." />
      <PrefSection title="Theme" description="Light, dark, or follow the system. Palettes below match this mode.">
        <PrefRow title="Color mode">
          <Segmented
            label="Color mode"
            value={appearance.colorMode}
            onChange={(colorMode) => onChange({ colorMode })}
            options={[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ]}
          />
        </PrefRow>
      </PrefSection>

      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-medium tracking-tight">Palette</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Accent and surface colors. Preview follows the mode above.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {PALETTES.map((palette) => {
            const tokens = paletteById(palette.id)[mode];
            const selected = appearance.palette === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ palette: palette.id })}
                className={cn(
                  "flex flex-col overflow-hidden rounded-lg border text-left transition-colors",
                  selected ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-foreground/20",
                )}
              >
                <span className="flex h-14" aria-hidden>
                  <span className="w-[42%]" style={{ backgroundColor: tokens.background }} />
                  <span className="w-[28%]" style={{ backgroundColor: tokens.card }} />
                  <span className="flex-1" style={{ backgroundColor: tokens.primary }} />
                </span>
                <span className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium leading-none">{palette.label}</span>
                    <span className="mt-1 block truncate text-[10px] leading-none text-muted-foreground">{palette.description}</span>
                  </span>
                  {selected ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" strokeWidth={2} />
                  ) : (
                    <span className="size-2.5 shrink-0 rounded-full ring-1 ring-border" style={{ backgroundColor: tokens.primary }} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <PrefSection title="Type" description="The note font is independent of the monospace used in code.">
        <PrefRow htmlFor="ui-font" title="UI font" description="Roboto matches Gerrit. Other faces are used when that font is installed.">
          <SelectControl id="ui-font" value={appearance.font} onChange={(font) => onChange({ font })} options={UI_FONTS} />
        </PrefRow>
        <PrefRow htmlFor="ui-mono" title="Code font" description="Code blocks and math source. Match UI keeps the pairing of the font above.">
          <SelectControl id="ui-mono" value={appearance.mono} onChange={(mono) => onChange({ mono })} options={UI_MONO_FONTS} />
        </PrefRow>
        <PrefRow title="Text size" description="Scales the whole interface, including the note.">
          <Segmented
            label="Text size"
            value={appearance.fontSize}
            onChange={(fontSize) => onChange({ fontSize })}
            options={UI_FONT_SIZES}
          />
        </PrefRow>
        <PrefRow title="Font weight" description="Shifts body type and labels together.">
          <Segmented
            label="Font weight"
            value={appearance.fontWeight}
            onChange={(fontWeight) => onChange({ fontWeight })}
            options={UI_FONT_WEIGHTS}
          />
        </PrefRow>
      </PrefSection>

      <PrefSection title="Layout" description="Width of the note, spacing, and corner radius.">
        <PrefRow title="Content width" description="Full uses the window. Narrow and comfortable cap the note column.">
          <Segmented
            label="Content width"
            value={appearance.contentWidth}
            onChange={(contentWidth) => onChange({ contentWidth })}
            options={[
              { id: "narrow" as const, label: "Narrow", icon: Columns2 },
              { id: "comfortable" as const, label: "Comfortable", icon: PanelLeft },
              { id: "full" as const, label: "Full", icon: Maximize2 },
            ]}
          />
        </PrefRow>
        <PrefRow title="Density" description="Compact tightens the note padding. Comfortable gives it more air.">
          <Segmented
            label="Density"
            value={appearance.density}
            onChange={(density) => onChange({ density })}
            options={UI_DENSITIES}
          />
        </PrefRow>
        <PrefRow title="Corners" description="Sharp is more technical. Rounded is softer.">
          <Segmented
            label="Corner radius"
            value={appearance.radius}
            onChange={(radius) => onChange({ radius })}
            options={UI_RADII}
          />
        </PrefRow>
      </PrefSection>

      <PrefSection title="Motion" description="In addition to the operating system setting.">
        <PrefRow htmlFor="reduce-motion" title="Reduce motion" description="Cuts animations and transitions in the sidebar and the editor.">
          <Switch id="reduce-motion" checked={appearance.reduceMotion} onChange={(reduceMotion) => onChange({ reduceMotion })} />
        </PrefRow>
      </PrefSection>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Stored locally on this computer.</p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" strokeWidth={1.75} />
          Reset appearance
        </button>
      </div>
    </div>
  );
}

function FilesSection({ vault, onPickFolder }: { vault: string; onPickFolder: () => void }) {
  return (
    <div className="space-y-8">
      <SectionHeading title="Files" description="Each note is one Markdown file. Images sit next to them in assets." />
      <Card title="Notes folder" description="Changing the folder opens that vault.">
        <div className="flex gap-2">
          <input
            readOnly
            aria-label="Notes folder"
            value={vault}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={onPickFolder}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
          >
            Change
          </button>
        </div>
      </Card>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="space-y-0.5 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PrefSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-medium tracking-tight">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="rounded-lg border border-border bg-card px-4 py-0.5">
        <div className="divide-y divide-border">{children}</div>
      </div>
    </section>
  );
}

function PrefRow({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1 pr-2">
        <label htmlFor={htmlFor} className="text-sm leading-snug font-medium">
          {title}
        </label>
        {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string; icon?: typeof Sun }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-md border border-border bg-muted/40 p-0.5">
      {options.map((option) => {
        const active = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors",
              active ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-3.5" strokeWidth={1.75} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectControl<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-8 w-44 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ModelControl({
  id,
  models,
  value,
  onChange,
}: {
  id: string;
  models: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (models.length === 0) {
    return (
      <input
        id={id}
        value={value}
        placeholder="model name"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-52 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-52 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">Select a model</option>
      {value && !models.includes(value) ? <option value={value}>{value}</option> : null}
      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}
