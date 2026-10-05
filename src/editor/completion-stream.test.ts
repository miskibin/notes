import { describe, expect, it, vi } from "vitest";
import { completionRequest, readCompletionStream } from "./completion-stream";

const response = (chunks: string[]) => new Response(new ReadableStream({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} }));

describe("completion transport", () => {
  it("shows progress across split events and preserves Polish UTF-8", async () => {
    const bytes = new TextEncoder().encode('{"response":" żółw","done":false}\n{"response":" idzie","done":true,"done_reason":"length"}\n');
    const progress = vi.fn();
    const stream = new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    } }));
    expect(await readCompletionStream(stream, new AbortController().signal, progress)).toEqual({ text: " żółw idzie", truncated: true });
    expect(progress.mock.calls.map(([text]) => text)).toEqual([" żółw", " żółw idzie"]);
  });

  it("handles a final event without a newline", async () => {
    expect(await readCompletionStream(response(['{"response":" notes","done":true}']), new AbortController().signal)).toEqual({ text: " notes", truncated: false });
  });

  it("rejects broken streams, Ollama errors and oversized events", async () => {
    for (const chunks of [
      ['{"response":"unfinished","done":false}\n'],
      ['{"error":"model missing"}\n'],
      ['x'.repeat(16_001)],
    ]) await expect(readCompletionStream(response(chunks), new AbortController().signal)).rejects.toThrow();
  });

  it("closes a pending reader immediately on cancellation", async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const stream = new Response(new ReadableStream({ cancel }));
    const result = readCompletionStream(stream, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps the latest prompt and uses a small streaming context", () => {
    const request = completionRequest("demo", "old".repeat(200) + " newest");
    expect(Array.from(request.prompt)).toHaveLength(300);
    expect(request.prompt.endsWith(" newest")).toBe(true);
    expect(request.stream).toBe(true);
    expect(request.think).toBe(false);
    expect(request.options.num_ctx).toBe(1024);
    expect(request.options.stop).toEqual(["\n"]);
  });
});
