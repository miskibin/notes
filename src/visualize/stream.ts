export const CHART_TIMEOUT_MS = 600_000;
export const CHART_TIMEOUT_MESSAGE = "Ollama generation exceeded 10 minutes. The server may still be running; try a smaller model or a shorter selection.";

// NDJSON boundaries are independent of HTTP chunks. TextDecoder preserves split UTF-8.
export async function readChartStream(response: Response, signal: AbortSignal, onProgress?: (text: string) => void): Promise<string> {
  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 280);
    try { detail = JSON.parse(body).error || detail; } catch { /* Plain HTTP error. */ }
    throw new Error(`Ollama HTTP ${response.status}: ${detail || response.statusText}`);
  }
  if (!response.body) throw new Error("Ollama returned no response body.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", output = "", done = false;
  const line = (value: string) => {
    if (!value.trim()) return;
    const event = JSON.parse(value) as { message?: { content?: string }; done?: boolean; done_reason?: string; error?: string };
    if (event.error) throw new Error(event.error);
    if (event.done_reason === "length") throw new Error("The model stopped before finishing the chart. Try a shorter idea.");
    if (done) throw new Error("Ollama sent data after the final response.");
    output += event.message?.content ?? "";
    if (output.length > 128_000) throw new Error("The model returned an oversized chart.");
    if (event.message?.content) onProgress?.(output);
    done = event.done === true;
  };
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!done) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (pending.length > 256_000) throw new Error("Ollama returned an oversized stream event.");
      if (chunk.done) { line(pending); pending = ""; break; }
    }
    if (!done) throw new Error("Ollama disconnected before finishing the chart.");
    if (!output.trim()) throw new Error("The model returned an empty chart.");
    return output;
  } finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
