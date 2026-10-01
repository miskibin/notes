import { expect, it } from "vitest";
import { searchNotes } from "./note-search";
import { withNoteMetadata } from "./note-metadata";

const base = { name: "runbook.md", title: "Deploy runbook", modified_ms: 4, line_count: 2 };

it("searches title, body and reference metadata", () => {
  const markdown = withNoteMetadata("# Deploy runbook\nProduction steps", { id: "n", references: [
    { id: "r", kind: "jira", label: "OPS-42", url: "https://jira.local/browse/OPS-42" },
  ] });
  expect(searchNotes([{ ...base, markdown }], "deploy")[0]?.score).toBe(3);
  expect(searchNotes([{ ...base, markdown }], "production")[0]?.snippet).toContain("Production");
  expect(searchNotes([{ ...base, markdown }], "OPS-42")[0]?.score).toBe(2);
});

it("keeps the match in snippets after multiline whitespace is collapsed", () => {
  const markdown = `${"\n".repeat(200)}needle at the end`;
  expect(searchNotes([{ ...base, markdown }], "needle")[0]?.snippet).toContain("needle");
});
