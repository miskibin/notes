import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, FolderPlus, Plus, Search, Settings2 } from "lucide-react";
import {
  ChatSidebar,
  ChatSidebarDnd,
  ChatSidebarItemGhost,
  ChatSidebarItemList,
  SideActionRow,
  SideIconBtn,
  SideRow,
  SidebarCollapsibleSection,
  SidebarEmptyState,
  type ChatSidebarItemData,
  type SidebarDndDrop,
  type SidebarItemMenuAction,
} from "@/components/ui/chat-sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { NoteFile } from "./notes";
import {
  assignNote,
  createProject,
  deleteProject,
  groupNotes,
  moveNote,
  renameProject,
  setPinned,
  type SidebarMeta,
} from "./sidebar-meta";

type SaveState = "saved" | "saving" | "error";

const COLLAPSE_KEY = "notes-sidebar-collapsed";
const PINNED_LIST = "pinned";
const NOTES_LIST = "notes";

export function Sidebar({
  notes,
  active,
  query,
  saveState,
  meta,
  onQuery,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onDeleteMany,
  onReorder,
  onMeta,
  screen,
  onSettings,
  onSearch,
}: {
  notes: NoteFile[];
  active: string | null;
  query: string;
  saveState: SaveState;
  meta: SidebarMeta;
  onQuery: (query: string) => void;
  onOpen: (name: string) => void;
  onCreate: () => void;
  onRename: (name: string, title: string) => void;
  onDelete: (name: string) => void;
  onDeleteMany: (names: string[]) => void;
  onReorder: (names: string[]) => void;
  onMeta: (meta: SidebarMeta) => void;
  screen: "notes" | "settings";
  onSettings: () => void;
  onSearch: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [searching, setSearching] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [closedProjects, setClosedProjects] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const groups = useMemo(() => groupNotes(notes, meta, query), [notes, meta, query]);
  const byId = useMemo(() => {
    const items = new Map<string, ChatSidebarItemData>();
    for (const note of notes) items.set(note.name, noteItem(note, meta.pinned.includes(note.name)));
    return items;
  }, [notes, meta.pinned]);

  const openSearch = () => {
    onSearch();
  };

  const addProject = () => {
    const id = crypto.randomUUID();
    onMeta(createProject(meta, { id, name: "Project" }));
    setProjectsOpen(true);
    setRenaming(id);
  };

  const menuFor = (item: ChatSidebarItemData): SidebarItemMenuAction[] => {
    const current = meta.projects.find((project) => project.notes.includes(item.id));
    const actions: SidebarItemMenuAction[] = meta.projects.map((project) => ({
      id: `project-${project.id}`,
      label: project.id === current?.id ? `Remove from ${project.name}` : project.name,
      icon: <Folder className="size-3.5" />,
      onSelect: () => onMeta(assignNote(meta, item.id, project.id === current?.id ? null : project.id)),
    }));
    actions.push({
      id: "new-project",
      label: "New project",
      icon: <FolderPlus className="size-3.5" />,
      onSelect: () => {
        const id = crypto.randomUUID();
        onMeta(createProject(meta, { id, name: "Project", note: item.id }));
        setProjectsOpen(true);
        setRenaming(id);
      },
    });
    return actions;
  };

  const handleDrop = (drop: SidebarDndDrop) => {
    if (drop.kind === "zone") {
      if (drop.action === "pin") onMeta(setPinned(meta, drop.itemId, true));
      if (drop.action === "delete") onDelete(drop.itemId);
      return;
    }
    if (drop.kind !== "reorder") return;
    if (drop.fromListId === drop.listId && drop.listId === NOTES_LIST) {
      onReorder(reorderIds(groups.loose.map((note) => note.name), drop.from, drop.to));
      return;
    }
    onMeta(moveNote(meta, drop.itemId, drop.fromListId, drop.listId, drop.from, drop.to));
  };

  const status = saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved";
  const showSearch = searching || query.length > 0;

  return (
    <ChatSidebarDnd
      onDrop={handleDrop}
      resolveDropVerb={(_from, toListId) => {
        if (toListId === PINNED_LIST) return { label: "Pin" };
        if (toListId === NOTES_LIST) return { label: "Notes" };
        const project = meta.projects.find((item) => item.id === toListId);
        return project ? { label: project.name } : null;
      }}
      renderOverlay={(id) => {
        const item = byId.get(id);
        return item ? <ChatSidebarItemGhost item={item} active={item.id === active} renderContent={renderNoteContent} /> : null;
      }}
    >
      <ChatSidebar
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        edgeZones
        className="notes-sidebar"
        widthExpanded={248}
        widthCollapsed={52}
        classNames={{ header: "notes-sidebar-toolbar", content: "notes-sidebar-content" }}
        brand={
            <SideActionRow>
              <SideIconBtn label="New note" onClick={onCreate}>
                <Plus className="size-4" />
              </SideIconBtn>
              <SideIconBtn label="Search" onClick={openSearch}>
                <Search className="size-4" />
              </SideIconBtn>
              <SideIconBtn label="New project" onClick={addProject}>
                <FolderPlus className="size-4" />
              </SideIconBtn>
            </SideActionRow>
        }
        nav={showSearch ? (
              <input
                ref={searchRef}
                autoFocus
                value={query}
                aria-label="Search notes"
                placeholder="Search notes…"
                className="notes-search"
                onChange={(event) => onQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onQuery("");
                    setSearching(false);
                  }
                }}
              />
            ) : null}
        rail={
          <>
            <SideIconBtn label="New note" onClick={onCreate}>
              <Plus className="size-4" />
            </SideIconBtn>
            <SideIconBtn label="Search" onClick={openSearch}>
              <Search className="size-4" />
            </SideIconBtn>
          </>
        }
        footer={
          <nav className="notes-sidebar-footer" aria-label="Workspace">
            {saveState !== "saved" ? <p role="status" title={status} className="notes-save-status">
              {collapsed ? (saveState === "error" ? "!" : "…") : status}
            </p> : null}
            {collapsed ? <SideIconBtn label="Settings" aria-current={screen === "settings" ? "page" : undefined} onClick={onSettings}>
              <Settings2 className="size-4" />
            </SideIconBtn> : <SideRow icon={<Settings2 className="size-4" />} aria-current={screen === "settings" ? "page" : undefined} onClick={onSettings}>
              Settings
            </SideRow>}
          </nav>
        }
      >
        {meta.pinned.length > 0 ? <SidebarCollapsibleSection
          title="Pinned"
          open={pinnedOpen}
          onToggle={() => setPinnedOpen((open) => !open)}
          className="notes-pinned-section"
        >
          <NoteList
            listId={PINNED_LIST}
            notes={groups.pinned}
            pinned
            active={active}
            empty="Nothing pinned."
            onOpen={onOpen}
            onRename={onRename}
            onMeta={onMeta}
            meta={meta}
            menuFor={menuFor}
            onDelete={onDelete}
            onDeleteMany={onDeleteMany}
          />
        </SidebarCollapsibleSection> : null}

        {meta.projects.length > 0 ? <SidebarCollapsibleSection
          title="Projects"
          open={projectsOpen}
          onToggle={() => setProjectsOpen((open) => !open)}
          className="mb-2"
        >
          {groups.projects.length === 0 ? <SidebarEmptyState>No projects yet.</SidebarEmptyState> : null}
          {groups.projects.map((project) =>
            renaming === project.id ? (
              <ProjectNameInput
                key={project.id}
                value={project.name}
                onCancel={() => setRenaming(null)}
                onCommit={(name) => {
                  setRenaming(null);
                  onMeta(renameProject(meta, project.id, name));
                }}
              />
            ) : (
              <SidebarCollapsibleSection
                key={project.id}
                className="mb-1"
                title={
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <span
                        className="truncate"
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setRenaming(project.id);
                        }}
                      >
                        {project.name}
                      </span>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-40">
                      <ContextMenuItem onSelect={() => setRenaming(project.id)}>Rename</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => {
                          if (window.confirm(`Delete project “${project.name}”? Notes are kept.`)) {
                            onMeta(deleteProject(meta, project.id));
                          }
                        }}
                      >
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                }
                open={!closedProjects[project.id]}
                onToggle={() => setClosedProjects((current) => ({ ...current, [project.id]: !current[project.id] }))}
              >
                <NoteList
                  listId={project.id}
                  notes={project.items}
                  active={active}
                  empty="No notes."
                  onOpen={onOpen}
                  onRename={onRename}
                  onMeta={onMeta}
                  meta={meta}
                  menuFor={menuFor}
                  onDelete={onDelete}
                  onDeleteMany={onDeleteMany}
                />
              </SidebarCollapsibleSection>
            ),
          )}
        </SidebarCollapsibleSection> : null}

        <SidebarCollapsibleSection
          title="Notes"
          open={notesOpen}
          onToggle={() => setNotesOpen((open) => !open)}
        >
          <NoteList
            listId={NOTES_LIST}
            notes={groups.loose}
            active={active}
            empty="Nothing outside projects."
            onOpen={onOpen}
            onRename={onRename}
            onMeta={onMeta}
            meta={meta}
            menuFor={menuFor}
            onDelete={onDelete}
            onDeleteMany={onDeleteMany}
          />
        </SidebarCollapsibleSection>
      </ChatSidebar>
    </ChatSidebarDnd>
  );
}

function NoteList({
  listId,
  notes,
  pinned = false,
  active,
  empty,
  onOpen,
  onRename,
  onDelete,
  onDeleteMany,
  onMeta,
  meta,
  menuFor,
}: {
  listId: string;
  notes: NoteFile[];
  pinned?: boolean;
  active: string | null;
  empty: string;
  onOpen: (name: string) => void;
  onRename: (name: string, title: string) => void;
  onDelete: (name: string) => void;
  onDeleteMany: (names: string[]) => void;
  onMeta: (meta: SidebarMeta) => void;
  meta: SidebarMeta;
  menuFor: (item: ChatSidebarItemData) => SidebarItemMenuAction[];
}) {
  const items = notes.map((note) => noteItem(note, pinned));
  return (
    <ChatSidebarItemList
      listId={listId}
      items={items}
      activeId={active ?? undefined}
      sortable
      showStatusDot={false}
      groupPinned={false}
      emptyState={<SidebarEmptyState>{empty}</SidebarEmptyState>}
      onSelect={onOpen}
      onRename={onRename}
      onTogglePin={(id, next) => onMeta(setPinned(meta, id, next))}
      onDelete={onDelete}
      onDeleteMany={onDeleteMany}
      onTogglePinMany={(ids, next) => {
        let updated = meta;
        for (const id of ids) updated = setPinned(updated, id, next);
        onMeta(updated);
      }}
      getMenuActions={menuFor}
      renderContent={renderNoteContent}
    />
  );
}

function noteItem(note: NoteFile, pinned: boolean): ChatSidebarItemData {
  const edited = new Date(note.modified_ms);
  const hasTime = note.modified_ms > 0;
  const lines = note.line_count;
  return {
    id: note.name,
    title: note.title,
    pinned,
    subtitle: pinned ? undefined : (
      <span className="notes-note-date" title={`${hasTime ? edited.toLocaleString() + " · " : ""}${lines} ${lines === 1 ? "line" : "lines"}`}>
        {hasTime ? <time dateTime={edited.toISOString()} title={edited.toLocaleString()}>
          {edited.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </time> : <span>—</span>}
      </span>
    ),
  };
}

function renderNoteContent(item: ChatSidebarItemData) {
  return <span className={`notes-note-content${item.pinned ? " notes-note-pinned" : ""}`}>
    <span className="notes-note-title">{item.title || "Untitled"}</span>
    {item.subtitle != null ? <span data-slot="sidebar-item-subtitle">{item.subtitle}</span> : null}
  </span>;
}

function ProjectNameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);
  return (
    <input
      autoFocus
      aria-label="Project name"
      value={draft}
      className="mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelRef.current) return;
        const next = draft.trim();
        if (!next || next === value) onCancel();
        else onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRef.current = true;
          onCancel();
        }
      }}
    />
  );
}

function reorderIds(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= ids.length) return ids;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  if (!item) return ids;
  next.splice(to, 0, item);
  return next;
}
