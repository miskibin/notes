import type { NoteFile } from "./notes";

export type Project = {
  id: string;
  name: string;
  notes: string[];
};

export type SidebarMeta = {
  pinned: string[];
  projects: Project[];
};

export const EMPTY_META: SidebarMeta = { pinned: [], projects: [] };

const storageKey = (vault: string) => `notes-sidebar:${vault}`;

export function readMeta(vault: string): SidebarMeta {
  if (!vault) return { ...EMPTY_META, projects: [] };
  try {
    const raw = localStorage.getItem(storageKey(vault));
    if (!raw) return { pinned: [], projects: [] };
    const parsed = JSON.parse(raw) as Partial<SidebarMeta>;
    const pinned = Array.isArray(parsed.pinned) ? parsed.pinned.filter((name) => typeof name === "string") : [];
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.flatMap((project) => {
          if (!project || typeof project.id !== "string" || typeof project.name !== "string") return [];
          const notes = Array.isArray(project.notes) ? project.notes.filter((name) => typeof name === "string") : [];
          return [{ id: project.id, name: project.name, notes }];
        })
      : [];
    return { pinned, projects };
  } catch {
    return { pinned: [], projects: [] };
  }
}

export function writeMeta(vault: string, meta: SidebarMeta): void {
  if (!vault) return;
  localStorage.setItem(storageKey(vault), JSON.stringify(meta));
}

export function pruneMeta(meta: SidebarMeta, names: string[]): SidebarMeta {
  const keep = new Set(names);
  return {
    pinned: meta.pinned.filter((name) => keep.has(name)),
    projects: meta.projects.map((project) => ({
      ...project,
      notes: project.notes.filter((name) => keep.has(name)),
    })),
  };
}

export function togglePin(meta: SidebarMeta, name: string): SidebarMeta {
  if (meta.pinned.includes(name)) return { ...meta, pinned: meta.pinned.filter((item) => item !== name) };
  return {
    pinned: [name, ...meta.pinned],
    projects: meta.projects.map((project) => ({
      ...project,
      notes: project.notes.filter((item) => item !== name),
    })),
  };
}

export function setPinned(meta: SidebarMeta, name: string, pinned: boolean): SidebarMeta {
  if (meta.pinned.includes(name) === pinned) return meta;
  return togglePin(meta, name);
}

export function forgetNote(meta: SidebarMeta, name: string): SidebarMeta {
  return {
    pinned: meta.pinned.filter((item) => item !== name),
    projects: meta.projects.map((project) => ({
      ...project,
      notes: project.notes.filter((item) => item !== name),
    })),
  };
}

export function assignNote(meta: SidebarMeta, name: string, projectId: string | null): SidebarMeta {
  return {
    pinned: projectId ? meta.pinned.filter((item) => item !== name) : meta.pinned,
    projects: meta.projects.map((project) => {
      const notes = project.notes.filter((item) => item !== name);
      if (project.id !== projectId) return { ...project, notes };
      return { ...project, notes: [...notes, name] };
    }),
  };
}

function reorder(list: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (!item) return list;
  next.splice(to, 0, item);
  return next;
}

/** Moves a note between the pinned list, a project list, or the loose "notes" list. */
export function moveNote(
  meta: SidebarMeta,
  name: string,
  fromListId: string,
  toListId: string,
  from: number,
  to: number,
): SidebarMeta {
  if (fromListId === toListId) {
    if (toListId === "pinned") return { ...meta, pinned: reorder(meta.pinned, from, to) };
    if (toListId === "notes") return meta;
    return {
      ...meta,
      projects: meta.projects.map((project) =>
        project.id === toListId ? { ...project, notes: reorder(project.notes, from, to) } : project,
      ),
    };
  }
  const stripped: SidebarMeta = {
    pinned: meta.pinned.filter((item) => item !== name),
    projects: meta.projects.map((project) => ({
      ...project,
      notes: project.notes.filter((item) => item !== name),
    })),
  };
  if (toListId === "notes") return stripped;
  if (toListId === "pinned") {
    const pinned = stripped.pinned.slice();
    pinned.splice(Math.max(0, Math.min(to, pinned.length)), 0, name);
    return { ...stripped, pinned };
  }
  return {
    ...stripped,
    projects: stripped.projects.map((project) => {
      if (project.id !== toListId) return project;
      const notes = project.notes.slice();
      notes.splice(Math.max(0, Math.min(to, notes.length)), 0, name);
      return { ...project, notes };
    }),
  };
}

export function createProject(meta: SidebarMeta, project: { id: string; name: string; note?: string }): SidebarMeta {
  const note = project.note;
  const projects = meta.projects.map((item) =>
    note ? { ...item, notes: item.notes.filter((name) => name !== note) } : item,
  );
  return {
    pinned: note ? meta.pinned.filter((item) => item !== note) : meta.pinned,
    projects: [...projects, { id: project.id, name: project.name, notes: note ? [note] : [] }],
  };
}

export function renameProject(meta: SidebarMeta, id: string, name: string): SidebarMeta {
  const next = name.trim();
  if (!next) return meta;
  return {
    ...meta,
    projects: meta.projects.map((project) => (project.id === id ? { ...project, name: next } : project)),
  };
}

export function deleteProject(meta: SidebarMeta, id: string): SidebarMeta {
  return { ...meta, projects: meta.projects.filter((project) => project.id !== id) };
}

export type ProjectGroup = Project & { items: NoteFile[] };

export function groupNotes(
  notes: NoteFile[],
  meta: SidebarMeta,
  query: string,
): { pinned: NoteFile[]; projects: ProjectGroup[]; loose: NoteFile[] } {
  const q = query.trim().toLowerCase();
  const matches = (note: NoteFile) =>
    !q || note.title.toLowerCase().includes(q) || note.name.toLowerCase().includes(q);
  const byName = new Map(notes.map((note) => [note.name, note]));
  const pinnedSet = new Set(meta.pinned.filter((name) => byName.has(name)));
  const projectNames = new Set(meta.projects.flatMap((project) => project.notes));
  const pinned = meta.pinned
    .map((name) => byName.get(name))
    .filter((note): note is NoteFile => !!note && matches(note));
  const projects = meta.projects.flatMap((project) => {
    const nameHit = !q || project.name.toLowerCase().includes(q);
    const items = project.notes
      .map((name) => byName.get(name))
      .filter((note): note is NoteFile => !!note && !pinnedSet.has(note.name) && (nameHit || matches(note)));
    if (q && items.length === 0 && !project.name.toLowerCase().includes(q)) return [];
    return [{ ...project, items }];
  });
  const loose = notes.filter((note) => matches(note) && !pinnedSet.has(note.name) && !projectNames.has(note.name));
  return { pinned, projects, loose };
}
