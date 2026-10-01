import { describe, expect, it, vi, afterEach } from "vitest";
import { canApplyFormat, cleanFormattedNote, FORMAT_LIMIT, validateFormatInput } from "./formatting";
import { formatNote } from "./vault-api";

afterEach(() => vi.unstubAllGlobals());

describe("formatting protects the original document", () => {
  it("rejects empty and oversized notes without cutting Unicode characters", () => {
    expect(() => validateFormatInput(" \n ")).toThrow("Write some text");
    expect(() => validateFormatInput("📝".repeat(FORMAT_LIMIT))).not.toThrow();
    expect(() => validateFormatInput("ą".repeat(FORMAT_LIMIT + 1))).toThrow("too long");
  });

  it("removes only a Markdown wrapper and preserves real code and math", () => {
    const note = "# Energia\n\n$E = mc^2$\n\n```js\nconst x = 2\n```";
    expect(cleanFormattedNote(`\n\`\`\`markdown\n${note}\n\`\`\`\n`)).toBe(note);
    expect(cleanFormattedNote("```js\nconst x = 2\n```")).toBe("```js\nconst x = 2\n```");
    expect(() => cleanFormattedNote("```md\n \n```")).toThrow("empty note");
  });

  it("cannot apply an old result to changed text, a different note or another vault", () => {
    const snapshot = { note: "a.md", vault: "Notes", original: "energia" };
    expect(canApplyFormat(snapshot, { ...snapshot })).toBe(true);
    for (const change of [{ original: "energia!" }, { note: "b.md" }, { vault: "Other" }]) {
      expect(canApplyFormat(snapshot, { ...snapshot, ...change })).toBe(false);
    }
  });
});

describe("format model response", () => {
  function mock(body: unknown, status = 200) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }

  it("uses the edit model with the complete original, math instructions and a bounded budget", async () => {
    const fetcher = mock({ message: { content: "# Energia\n\n$E = mc^2$" }, done_reason: "stop" });
    expect(await formatNote("http://localhost:11434/", "edit-model", "Energia E = mc^2")).toContain("$E = mc^2$");
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const payload = JSON.parse(request.body);
    expect(payload.model).toBe("edit-model");
    expect(payload.messages[1].content).toContain("Energia E = mc^2");
    expect(payload.messages[0].content).toContain("Do not summarize");
    expect(payload.messages[0].content).toContain("KaTeX");
    expect(payload.options.num_predict).toBe(1024);
  });

  it("rejects incomplete or empty responses and server errors", async () => {
    mock({ message: { content: "# Partial" }, done_reason: "length" });
    await expect(formatNote("http://localhost", "model", "original")).rejects.toThrow("stopped before finishing");
    mock({ message: { content: " " } });
    await expect(formatNote("http://localhost", "model", "original")).rejects.toThrow("empty note");
    mock({ error: "model not found" }, 404);
    await expect(formatNote("http://localhost", "model", "original")).rejects.toThrow("model not found");
  });

  it("does not submit a request without a model or with oversized input", async () => {
    const fetcher = mock({});
    await expect(formatNote("http://localhost", "", "original")).rejects.toThrow("Choose an edit model");
    await expect(formatNote("http://localhost", "model", "x".repeat(FORMAT_LIMIT + 1))).rejects.toThrow("too long");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
