import { describe, expect, it } from "vitest";
import { classifyReference, ensureNoteMetadata, noteBody, readNoteMetadata, referenceLabel, wikiLinks, withNoteMetadata } from "./note-metadata";

describe("note metadata", () => {
  it("round-trips references in Markdown frontmatter without changing the body", () => {
    const original = "# Runbook\n\nKeep --- inside the note.";
    const markdown = withNoteMetadata(original, { id: "note-1", references: [
      { id: "ref-1", kind: "jira", url: "https://jira.example/browse/OPS-42", label: "OPS-42" },
    ] });
    expect(readNoteMetadata(markdown)).toEqual({ id: "note-1", references: [
      { id: "ref-1", kind: "jira", url: "https://jira.example/browse/OPS-42", label: "OPS-42" },
    ] });
    expect(noteBody(markdown)).toBe(original);
  });

  it("adds an id once and retains invalid or unrelated content", () => {
    const first = ensureNoteMetadata("# One\n", () => "stable");
    expect(ensureNoteMetadata(first, () => "different")).toBe(first);
    expect(readNoteMetadata(first).id).toBe("stable");
  });

  it("classifies private URLs locally and derives short labels", () => {
    expect(classifyReference("https://github.com/miskibin/notes/pull/17")).toBe("github");
    expect(referenceLabel("https://github.com/miskibin/notes/pull/17")).toBe("miskibin/notes #17");
    expect(classifyReference("https://jira.corp/browse/OPS-42")).toBe("jira");
    expect(referenceLabel("https://jira.corp/browse/OPS-42")).toBe("OPS-42");
  });

  it("finds wiki links only in the editable body", () => {
    expect(wikiLinks(withNoteMetadata("See [[Deploy runbook]] and [[OPS-42]].", { id: "x", references: [] })))
      .toEqual(["Deploy runbook", "OPS-42"]);
  });
});
