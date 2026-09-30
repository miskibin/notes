import { describe, expect, it } from "vitest";
import type { NoteFile } from "./notes";
import { assignNote, createProject, groupNotes, moveNote, togglePin, type SidebarMeta } from "./sidebar-meta";

const notes: NoteFile[] = [
  { name: "a.md", title: "Alpha", modified_ms: 2 },
  { name: "b.md", title: "Beta", modified_ms: 1 },
  { name: "c.md", title: "Gamma", modified_ms: 3 },
];

const empty: SidebarMeta = { pinned: [], projects: [] };

describe("sidebar groups", () => {
  it("pins a note out of its project and keeps the project", () => {
    const meta = togglePin(assignNote(createProject(empty, { id: "p1", name: "Work", note: "a.md" }), "b.md", "p1"), "a.md");
    const groups = groupNotes(notes, meta, "");
    expect(groups.pinned.map((note) => note.name)).toEqual(["a.md"]);
    expect(groups.projects[0]?.items.map((note) => note.name)).toEqual(["b.md"]);
    expect(groups.loose.map((note) => note.name)).toEqual(["c.md"]);
  });

  it("moves a note between a project, the pin list, and loose notes", () => {
    let meta = assignNote(createProject(empty, { id: "p1", name: "Work", note: "a.md" }), "b.md", "p1");
    meta = moveNote(meta, "b.md", "p1", "p1", 1, 0);
    expect(meta.projects[0]?.notes).toEqual(["b.md", "a.md"]);
    meta = moveNote(meta, "c.md", "notes", "p1", 0, 1);
    expect(meta.projects[0]?.notes).toEqual(["b.md", "c.md", "a.md"]);
    meta = moveNote(meta, "c.md", "p1", "pinned", 1, 0);
    expect(meta.pinned).toEqual(["c.md"]);
    expect(meta.projects[0]?.notes).toEqual(["b.md", "a.md"]);
    meta = moveNote(meta, "c.md", "pinned", "notes", 0, 0);
    expect(meta.pinned).toEqual([]);
  });

  it("filters notes without hiding a project whose name matches", () => {
    const meta = createProject(empty, { id: "p1", name: "Work", note: "a.md" });
    const groups = groupNotes(notes, meta, "work");
    expect(groups.projects[0]?.items.map((note) => note.title)).toEqual(["Alpha"]);
    expect(groups.loose).toEqual([]);
  });
});
