import { describe, expect, it } from "vitest";
import { bindWikiReferences, classifyReference, ensureNoteMetadata, noteBody, readNoteMetadata, referenceLabel, referenceUrl, wikiLinks, withNoteBody, withNoteMetadata } from "./note-metadata";

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

  it("preserves other YAML fields and comments when metadata changes", () => {
    const original = "---\n# Keep this comment\ntags: [physics, notes]\ncustom:\n  owner: me\nnotes:\n  custom: kept\n---\nBody";
    const updated = ensureNoteMetadata(original, () => "stable");
    expect(updated).toContain("# Keep this comment");
    expect(updated).toContain("tags: [ physics, notes ]");
    expect(updated).toContain("owner: me");
    expect(updated).toContain("custom: kept");
    expect(noteBody(updated)).toBe("Body");
    expect(withNoteBody(original, "Edited body")).toBe(original.replace(/Body$/, "Edited body"));
  });

  it("does not consume a horizontal rule or destroy malformed YAML", () => {
    const malformed = "---\nfoo: [broken\n---\nBody";
    expect(ensureNoteMetadata(malformed, () => "id")).toBe(malformed);
    expect(withNoteBody(malformed, "Edit")).toBe(malformed.replace(/Body$/, "Edit"));
    expect(noteBody("---\nText\n---not a fence\nEnd")).toBe("---\nText\n---not a fence\nEnd");
  });

  it("binds wiki links to stable ids and removes their metadata when the link is deleted", () => {
    const target = { title: "Target", markdown: withNoteMetadata("# Target", { id: "target-id", references: [] }) };
    const linked = bindWikiReferences("See [[Target]] and [[Target]]", [target]);
    const reference = readNoteMetadata(linked).references[0];
    expect(readNoteMetadata(linked).references).toHaveLength(1);
    expect(reference.noteId).toBe("target-id");
    expect(bindWikiReferences(linked, [{ ...target, title: "Renamed" }])).toBe(linked);
    expect(readNoteMetadata(bindWikiReferences(withNoteBody(linked, "Removed"), [target])).references).toEqual([]);
    expect(wikiLinks("`[[Literal]]`\n\n```md\n[[Code]]\n```\n\n[[Real]]")).toEqual(["Real"]);
  });

  it("rejects executable URL schemes", () => {
    expect(referenceUrl("https://jira.local/OPS-42")).toBe("https://jira.local/OPS-42");
    expect(() => referenceUrl("javascript:alert(1)")).toThrow();
    expect(() => referenceUrl("data:text/html,x")).toThrow();
  });
});
