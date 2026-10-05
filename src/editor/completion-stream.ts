export type CompletionResult = { text: string; truncated: boolean };

export function completionRequest(model: string, line: string) {
  return {
    model, prompt: Array.from(line).slice(-300).join(""), stream: true, raw: true,
    think: false, keep_alive: "30m",
    options: { num_predict: 16, num_ctx: 1024, temperature: 0.2, top_p: 0.9, repeat_penalty: 1.08, stop: ["\n"] },
  };
}

export async function readCompletionStream(response: Response, signal: AbortSignal, onProgress?: (text: string) => void): Promise<CompletionResult> {
  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 280);
    try { detail = JSON.parse(body).error || detail; } catch { /* Plain HTTP error. */ }
    throw new Error(`Ollama HTTP ${response.status}: ${detail || response.statusText}`);
  }
  if (!response.body) throw new Error("Ollama returned no completion body.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", text = "", done = false, truncated = false;
  const line = (value: string) => {
    if (!value.trim()) return;
    const event = JSON.parse(value) as { response?: string; done?: boolean; done_reason?: string; error?: string };
    if (event.error) throw new Error(event.error);
    text += event.response ?? "";
    if (text.length > 2000) throw new Error("Ollama returned an oversized completion.");
    if (event.response) onProgress?.(text);
    done = event.done === true;
    truncated = event.done_reason === "length";
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
      while (!done && (end = pending.indexOf("\n")) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (pending.length > 16_000) throw new Error("Ollama returned an oversized completion event.");
      if (chunk.done) { if (!done) line(pending); break; }
    }
    if (!done) throw new Error("Ollama disconnected before finishing the completion.");
    return { text, truncated };
  } finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
