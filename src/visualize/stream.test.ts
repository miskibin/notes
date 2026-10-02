import { describe, expect, it } from "vitest";
import { readChartStream } from "./stream";

function response(events: unknown[]) {
  const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join("\n"));
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset + 3)); offset += 3;
  } }));
}
describe("Ollama chart stream", () => {
  it("preserves UTF-8 across chunks, reports partial output and waits for done", async () => {
    const progress: string[] = [];
    const raw = await readChartStream(response([
      { message: { content: "zażółć " }, done: false },
      { message: { content: "😀" }, done: false },
      { done: true },
    ]), new AbortController().signal, content => progress.push(content));
    expect(raw).toBe("zażółć 😀"); expect(progress).toEqual(["zażółć ", "zażółć 😀"]);
  });
  it("rejects a dropped connection instead of executing incomplete Python", async () => {
    await expect(readChartStream(response([{ message: { content: "partial" }, done: false }]), new AbortController().signal)).rejects.toThrow("disconnected");
  });
  it("keeps model errors and HTTP errors distinct", async () => {
    await expect(readChartStream(response([{ error: "model not found" }]), new AbortController().signal)).rejects.toThrow("model not found");
    await expect(readChartStream(new Response('{"error":"model unavailable"}', { status: 404 }), new AbortController().signal)).rejects.toThrow("HTTP 404: model unavailable");
  });
  it("cancels a stalled reader and retains AbortError", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const stalled = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const request = readChartStream(stalled, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });
});
