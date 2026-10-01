import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { FormatDialog } from "./FormatDialog";
import { canApplyFormat, validateFormatInput, type FormatSnapshot } from "./formatting";
import { applyAppearance, stepTextZoom } from "./appearance";
import { NoteCanvas } from "./editor/NoteCanvas";
import { SourceCanvas } from "./editor/SourceCanvas";
import type { EditorHandle, EditorSelection } from "./editor/editor-handle";
import { EditorContextMenu } from "./editor/EditorContextMenu";
import { chartMarkdown, validateIdea, type ChartRecipe } from "./visualize/recipe";
import type { ChartImage } from "./visualize/python";
import type { CompleteBridge, CompletionStatus } from "./editor/autocomplete";
import { countLines, newNoteName, retitle, titleFrom, type NoteFile } from "./notes";
import { readSettings, writeSettings, type Settings } from "./settings";
import { SettingsPage } from "./SettingsPage";
import { Sidebar } from "./Sidebar";
import {
  forgetNote,
  pruneMeta,
  readMeta,
  writeMeta,
  type SidebarMeta,
} from "./sidebar-meta";
import { textZoomDirection } from "./text-zoom";
import { createSaveQueue } from "./save-queue";
import {
  completeLine,
  defaultVaultDir,
  editSelection,
  deleteNote,
  ensureWelcome,
  isTauri,
  listModels,
  listNotes,
  pickVaultDir,
  readNote,
  writeNote,
  saveImage,
} from "./vault-api";

type Screen = "notes" | "settings";
type SaveState = "saved" | "saving" | "error";
type VisualSession = { note: string; vault: string; selection: EditorSelection; editor: EditorHandle };
const VisualizeDialog = lazy(() => import("./visualize/VisualizeDialog"));

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  const [screen, setScreen] = useState<Screen>("notes");
  const [sourceMode, setSourceMode] = useState(false);
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [filter, setFilter] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [meta, setMeta] = useState<SidebarMeta>({ pinned: [], projects: [] });
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>("idle");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [formatSession, setFormatSession] = useState<FormatSnapshot | null>(null);
  const openingFormat = useRef(false);
  const transitionBusy = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const [visualSession, setVisualSession] = useState<VisualSession | null>(null);
  const visualRef = useRef<VisualSession | null>(null);

  const settingsRef = useRef(settings);
  const activeRef = useRef(active);
  const draftRef = useRef("");
  const savedRef = useRef("");
  const editorHandle = useRef<EditorHandle | null>(null);
  const columnRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number>(0);
  const enqueueSave = useRef(createSaveQueue());
  const refreshId = useRef(0);
  const bridge = useRef<CompleteBridge>({
    enabled: false,
    model: "",
    editModel: "",
    complete: (line) => completeLine(settings.ollamaHost, settings.model, line),
    edit: (instruction, text) => editSelection(settings.ollamaHost, settings.editModel, instruction, text),
  });
  settingsRef.current = settings;
  activeRef.current = active;
  bridge.current = {
    enabled: settings.autocomplete,
    model: settings.model,
    editModel: settings.editModel,
    complete: (line) => completeLine(settingsRef.current.ollamaHost, settingsRef.current.model, line),
    edit: (instruction, text) =>
      editSelection(settingsRef.current.ollamaHost, settingsRef.current.editModel, instruction, text),
    report: (status, error) => {
      setCompletionStatus(status);
      setCompletionError(error ?? null);
    },
  };

  const persist = useCallback((next: Settings) => {
    settingsRef.current = next;
    setSettings(next);
    writeSettings(next);
    applyAppearance(next);
  }, []);

  const transition = useCallback(async (operation: () => Promise<void>) => {
    if (transitionBusy.current) return;
    transitionBusy.current = true;
    setTransitioning(true);
    try { await operation(); setLoadError(null); }
    catch (error) { setLoadError(errorText(error)); }
    finally { transitionBusy.current = false; setTransitioning(false); }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = textZoomDirection(event);
      if (direction == null) return;
      event.preventDefault();
      event.stopPropagation();
      const current = settingsRef.current;
      persist({ ...current, textZoom: stepTextZoom(current.textZoom, direction) });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [persist]);

  useEffect(() => {
    const next = readSettings();
    const current = settingsRef.current;
    if (next.appearanceRev === current.appearanceRev && next.contentWidth === current.contentWidth && next.font === current.font) return;
    persist(next);
  }, [persist]);

  useEffect(() => {
    applyAppearance(settingsRef.current);
    if (settings.colorMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(settingsRef.current);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.colorMode]);

  const refreshNotes = useCallback(async (vault: string, prefer?: string) => {
    const ticket = ++refreshId.current;
    await ensureWelcome(vault);
    const listed = await listNotes(vault);
    const name = listed.some((note) => note.name === prefer)
      ? prefer
      : listed.some((note) => note.name === activeRef.current)
        ? activeRef.current
        : (listed[0]?.name ?? null);
    const body = name ? await readNote(vault, name) : "";
    if (ticket !== refreshId.current) return;
    const pruned = pruneMeta(readMeta(vault), listed.map((note) => note.name));
    writeMeta(vault, pruned);
    setMeta(pruned);
    setNotes(listed);
    draftRef.current = body;
    savedRef.current = body;
    setMarkdown(body);
    setActive(name ?? null);
    setSaveState("saved");
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const name = activeRef.current;
    const vault = settingsRef.current.vault;
    const body = editorHandle.current?.getMarkdown() ?? draftRef.current;
    draftRef.current = body;
    setMarkdown(body);
    if (!name || !vault) return;
    if (body === savedRef.current && !enqueueSave.current.isPending()) { setSaveState("saved"); return; }
    setSaveState("saving");
    try {
      await enqueueSave.current(() => writeNote(vault, name, body));
    } catch (error) {
      setSaveState("error");
      throw error;
    }
    if (activeRef.current === name && settingsRef.current.vault === vault) savedRef.current = body;
    setNotes((current) =>
      current.map((note) =>
        note.name === name ? { ...note, title: titleFrom(body, name), line_count: countLines(body), modified_ms: Date.now() } : note,
      ),
    );
    if (activeRef.current === name && settingsRef.current.vault === vault && draftRef.current === body) setSaveState("saved");
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let closing = false;
    const appWindow = getCurrentWindow();
    const listening = appWindow.onCloseRequested((event) => {
      event.preventDefault();
      if (closing || transitionBusy.current) return;
      closing = true;
      transitionBusy.current = true;
      setTransitioning(true);
      void flush().then(async () => {
        await appWindow.destroy();
      }).catch((error: unknown) => {
        setLoadError(errorText(error));
      }).finally(() => { closing = false; transitionBusy.current = false; setTransitioning(false); });
    });
    void listening.then((unlisten) => { if (disposed) unlisten(); }).catch((error: unknown) => setLoadError(errorText(error)));
    return () => { disposed = true; void listening.then((unlisten) => unlisten()).catch(() => undefined); };
  }, [flush]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = readSettings();
        const vault = !isTauri()
          ? "Browser notes"
          : stored.vault && stored.vault !== "Browser notes"
            ? stored.vault
            : await defaultVaultDir();
        const next = { ...stored, vault };
        if (cancelled) return;
        if (isTauri()) persist(next);
        else setSettings(next);
        await refreshNotes(vault);
        if (!cancelled) setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(errorText(error));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      refreshId.current += 1;
    };
  }, [persist, refreshNotes]);

  const onChange = useCallback(
    (next: string) => {
      draftRef.current = next;
      setMarkdown(next);
      const nameNow = activeRef.current;
      const vaultNow = settingsRef.current.vault;
      if (nameNow) {
        setNotes((current) =>
          current.map((note) => (note.name === nameNow ? { ...note, title: titleFrom(next, nameNow), line_count: countLines(next) } : note)),
        );
      }
      setSaveState("saving");
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const name = nameNow;
        const vault = vaultNow;
        if (!name || activeRef.current !== name || settingsRef.current.vault !== vault) return;
        void enqueueSave.current(() => writeNote(vault, name, next))
          .then(() => {
            if (activeRef.current !== name || settingsRef.current.vault !== vault) return;
            savedRef.current = next;
            if (draftRef.current !== next) return;
            setSaveState("saved");
            setNotes((current) =>
              current
                .map((note) =>
                  note.name === name
                    ? { ...note, title: titleFrom(next, name), line_count: countLines(next), modified_ms: Date.now() }
                    : note,
                )
                .sort((a, b) => b.modified_ms - a.modified_ms),
            );
          })
          .catch(() => {
            if (activeRef.current === name && settingsRef.current.vault === vault) setSaveState("error");
          });
      }, 400);
    },
    [],
  );

  const openNote = async (name: string) => {
    if (transitionBusy.current) return;
    if (name === activeRef.current) {
      setScreen("notes");
      return;
    }
    await transition(async () => {
      await flush();
      const body = await readNote(settingsRef.current.vault, name);
      draftRef.current = body;
      savedRef.current = body;
      setMarkdown(body);
      setActive(name);
      setScreen("notes");
      setSaveState("saved");
    });
  };

  const createNote = async () => {
    await transition(async () => {
      await flush();
      const name = newNoteName(notes.map((note) => note.name));
      await writeNote(settings.vault, name, "");
      await refreshNotes(settings.vault, name);
      setScreen("notes");
    });
  };

  const commitMeta = (next: SidebarMeta) => {
    setMeta(next);
    writeMeta(settingsRef.current.vault, next);
  };

  const renameTitle = async (name: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    await transition(async () => {
      const current = name === activeRef.current ? draftRef.current : await readNote(settingsRef.current.vault, name);
      const next = retitle(current, nextTitle);
      if (next === current) return;
      if (name === activeRef.current) {
        draftRef.current = next;
        setMarkdown(next);
        setEpoch((value) => value + 1);
        onChange(next);
        return;
      }
      await writeNote(settingsRef.current.vault, name, next);
      setNotes((items) => items.map((note) => (note.name === name ? { ...note, title: titleFrom(next, name), line_count: countLines(next), modified_ms: Date.now() } : note)));
    });
  };

  const reorderLoose = (names: string[]) => {
    const order = new Map(names.map((name, index) => [name, index]));
    setNotes((current) => {
      const loose = current.filter((note) => order.has(note.name));
      const sorted = [...loose].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
      let index = 0;
      return current.map((note) => (order.has(note.name) ? (sorted[index++] ?? note) : note));
    });
  };

  const removeNotes = async (names: string[]) => {
    if (names.length === 0 || transitionBusy.current) return;
    const label = names.length === 1 ? names[0] : `${names.length} notes`;
    if (!window.confirm(`Delete ${label}?`)) return;
    window.clearTimeout(saveTimer.current);
    const drop = new Set(names);
    await transition(async () => {
      await flush();
      for (const name of names) await deleteNote(settings.vault, name);
      let nextMeta = readMeta(settings.vault);
      for (const name of names) nextMeta = forgetNote(nextMeta, name);
      commitMeta(nextMeta);
      const remaining = notes.filter((note) => !drop.has(note.name));
      setNotes(remaining);
      if (!activeRef.current || !drop.has(activeRef.current)) return;
      const next = remaining[0]?.name ?? null;
      if (!next) {
        setActive(null);
        setMarkdown("");
        draftRef.current = "";
        savedRef.current = "";
        return;
      }
      const body = await readNote(settings.vault, next);
      draftRef.current = body;
      savedRef.current = body;
      setMarkdown(body);
      setActive(next);
    });
  };

  const refreshModels = async (host: string) => {
    try {
      const listed = await listModels(host);
      setModels(listed);
      setModelError(listed.length === 0 ? "Ollama has no models yet." : null);
    } catch (error) {
      setModels([]);
      setModelError(errorText(error));
    }
  };

  const headerTitle = active ? titleFrom(markdown, active) : "";
  const words = markdown.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const openFormat = async () => {
    if (openingFormat.current || formatSession || visualRef.current || transitionBusy.current) return;
    openingFormat.current = true;
    try {
      const original = editorHandle.current?.getMarkdown() ?? draftRef.current;
      const snapshot = { note: activeRef.current ?? "", vault: settingsRef.current.vault, original };
      validateFormatInput(original);
      await flush();
      if (!snapshot.note || !canApplyFormat(snapshot, {
        note: activeRef.current ?? "", vault: settingsRef.current.vault,
        original: editorHandle.current?.getMarkdown() ?? draftRef.current,
      })) return;
      setLoadError(null);
      setFormatSession(snapshot);
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      openingFormat.current = false;
    }
  };
  const applyFormat = (formatted: string): string | null => {
    const handle = editorHandle.current;
    if (!handle || !formatSession || !canApplyFormat(formatSession, {
      note: activeRef.current ?? "", vault: settingsRef.current.vault, original: handle.getMarkdown(),
    })) return "The note changed while formatting. Discard this preview and format the current version.";
    try {
      handle.replaceMarkdown(formatted);
      setFormatSession(null);
      setLoadError(null);
      return null;
    } catch (error) {
      return errorText(error);
    }
  };
  const toggleSource = useCallback(() => {
    const latest = editorHandle.current?.getMarkdown();
    if (latest != null && latest !== draftRef.current) onChange(latest);
    setSourceMode((current) => !current);
  }, [onChange]);
  const openVisualize = (selection: EditorSelection) => {
    const editor = editorHandle.current;
    if (!editor || !activeRef.current || formatSession || visualRef.current) return;
    try {
      validateIdea(selection.text);
      const session = { note: activeRef.current, vault: settingsRef.current.vault, editor, selection };
      visualRef.current = session;
      setVisualSession(session);
    } catch (error) { setLoadError(errorText(error)); }
  };
  const closeVisualize = () => {
    visualRef.current = null;
    setVisualSession(null);
  };
  const insertChart = async (recipe: ChartRecipe, image: ChartImage): Promise<string | null> => {
    const session = visualRef.current;
    const valid = () => session && visualRef.current === session && editorHandle.current === session.editor &&
      activeRef.current === session.note && settingsRef.current.vault === session.vault &&
      session.editor.getMarkdown() === session.selection.document;
    if (!session || !valid()) return "The note changed. Visualize the current selection again.";
    const bytes = Uint8Array.from(atob(image.dataUrl.split(",")[1]), (character) => character.charCodeAt(0));
    const asset = await saveImage(session.vault, new File([bytes], "visualization.png", { type: "image/png" }));
    if (!valid()) return "The note changed. Visualize the current selection again.";
    session.editor.insertAfterSelection(chartMarkdown(recipe, asset), session.selection);
    closeVisualize();
    setLoadError(null);
    return null;
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screen !== "notes" || document.querySelector("dialog[open]") || event.isComposing || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      toggleSource();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [screen, toggleSource]);
  const navigate = async (next: Screen) => {
    if (next === screen) return;
    await transition(async () => {
      if (screen === "notes") await flush();
      setScreen(next);
      if (next === "settings") void refreshModels(settingsRef.current.ollamaHost);
    });
  };

  useEffect(() => {
    const scroll = scrollRef.current;
    const column = columnRef.current;
    if (!scroll || !column) return;
    scroll.scrollTop = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Transient scroll values stay in CSS, so scrolling never re-renders the editor.
      const heading = scroll.querySelector<HTMLElement>(".ProseMirror h1, .cm-line");
      const end = heading ? heading.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top + scroll.scrollTop : 120;
      const toolbar = parseFloat(getComputedStyle(column).getPropertyValue("--toolbar-height")) || 52;
      const start = Math.max(0, end - toolbar - 28);
      const opacity = Math.min(1, Math.max(0, (scroll.scrollTop - start) / 28));
      column.style.setProperty("--document-title-opacity", String(opacity));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [active, epoch, screen, sourceMode]);

  return (
    <div className="app">
      <div className="app-body" inert={transitioning} aria-busy={transitioning}>
      <Sidebar
        notes={notes}
        active={active}
        query={filter}
        saveState={saveState}
        meta={meta}
        onQuery={setFilter}
        onOpen={(name) => void openNote(name)}
        onCreate={() => void createNote()}
        onRename={(name, title) => void renameTitle(name, title)}
        onDelete={(name) => void removeNotes([name])}
        onDeleteMany={(names) => void removeNotes(names)}
        onReorder={reorderLoose}
        onMeta={commitMeta}
        screen={screen}
        onSettings={() => void navigate("settings")}
      />
      <main id="note-content" className="note-column" ref={columnRef}>
        <AppHeader title={headerTitle} screen={screen} sourceMode={sourceMode} onToggleSource={toggleSource} onNavigate={(next) => void navigate(next)} />
        <div className={`note-scroll${screen === "settings" ? " note-scroll-settings" : ""}`} ref={scrollRef}>
        {!ready ? <p className="empty">Opening notes…</p> : null}
        {loadError ? <div className="error-line" role="alert"><span>{loadError}</span><button type="button" onClick={() => setLoadError(null)}>Dismiss</button></div> : null}
        {ready && screen === "settings" ? (
          <SettingsPage
            settings={settings}
            models={models}
            modelError={modelError}
            onChange={persist}
            onHostBlur={() => void refreshModels(settings.ollamaHost)}
            onPickFolder={() => {
              void pickVaultDir().then(async (folder) => {
                if (!folder) return;
                await transition(async () => {
                  await flush();
                  await refreshNotes(folder);
                  persist({ ...settingsRef.current, vault: folder });
                  setScreen("notes");
                });
              }).catch((error: unknown) => setLoadError(errorText(error)));
            }}
            onBack={() => void navigate("notes")}
          />
        ) : null}
        {ready && screen === "notes" && active ? (
          <EditorContextMenu editorHandle={editorHandle} onVisualize={openVisualize}>{sourceMode ? <SourceCanvas
            noteKey={`${settings.vault}:${active}:${epoch}`}
            markdown={markdown}
            onChange={onChange}
            editorHandle={editorHandle}
          /> : <NoteCanvas
            noteKey={`${settings.vault}:${active}:${epoch}`}
            markdown={markdown}
            vault={settings.vault}
            bridge={bridge}
            onChange={onChange}
            editorHandle={editorHandle}
          />}</EditorContextMenu>
        ) : null}
        {ready && screen === "notes" && !active && !loadError ? <p className="empty">No notes yet.</p> : null}
        </div>
      </main>
      </div>
      <AppFooter saveState={saveState} words={words} enabled={settings.autocomplete} model={settings.model}
        status={completionStatus} error={completionError} sourceMode={sourceMode} editing={ready && screen === "notes" && Boolean(active)}
        formatting={formatSession !== null || visualSession !== null || transitioning} onToggle={() => persist({ ...settingsRef.current, autocomplete: !settingsRef.current.autocomplete })}
        onFormat={() => void openFormat()} onRetrySave={() => void flush().catch((error: unknown) => setLoadError(errorText(error)))} />
      {formatSession ? <FormatDialog snapshot={formatSession} host={settings.ollamaHost} model={settings.editModel}
        onClose={() => setFormatSession(null)} onApply={applyFormat}
        onSettings={() => { setFormatSession(null); void navigate("settings"); }} /> : null}
      {visualSession ? <Suspense fallback={null}><VisualizeDialog idea={visualSession.selection.text} host={settings.ollamaHost} model={settings.editModel}
        onClose={closeVisualize} onInsert={insertChart} onSettings={() => { closeVisualize(); void navigate("settings"); }} /></Suspense> : null}
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}
