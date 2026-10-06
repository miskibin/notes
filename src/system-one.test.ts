import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ invoke: vi.fn(), channels: [] as { onmessage?: (event: { started: boolean }) => void }[] }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, Channel: class { onmessage?: (event: { started: boolean }) => void; constructor() { native.channels.push(this); } } }));
import { requestSystemOne, systemOneError } from "./vault-api";
import { structureRequest } from "./structure";
const body = structureRequest("tev1:0.8b-q8_0", { text: "Example.", before: "", after: "", underH2: false });
const response = { answers: { structure: { type: "choice", choice: "keep", probabilities: { keep: 1, heading_2: 0, heading_3: 0, bullet_item: 0 } } } };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); native.invoke.mockReset(); native.channels.length = 0; });

describe("System One transport", () => {
  it("uses only the System One contract and respects an explicitly configured remote host", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestSystemOne("https://explicit.example/", body, new AbortController().signal)).toEqual(response);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://explicit.example/v1/systemone");
    expect(request.redirect).toBe("error");
    expect(Object.keys(JSON.parse(request.body as string)).sort()).toEqual(["keep_alive", "model", "questions", "state"]);
    expect(JSON.parse(request.body as string).questions.structure.type).toBe("choice");
  });
  it.each([
    [404, "model 'tev1' not found", "missing_model"], [404, "404 page not found", "unsupported_endpoint"],
    [400, "model does not support scoring", "incompatible_model"], [400, "incompatible GGUF", "incompatible_model"],
    [413, "context limit exceeded", "context"], [500, "unknown error", "invalid_response"],
  ])("distinguishes HTTP %i: %s", (status, detail, code) => {
    expect(systemOneError(status, JSON.stringify({ error: detail }), body.model).message).toContain(code);
    if (code === "missing_model") expect(systemOneError(status, detail, body.model).message).toContain("ollama pull tev1:0.8b-q8_0");
  });
  it("distinguishes connection, timeout, context and malformed response errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(requestSystemOne("http://local", body, new AbortController().signal)).rejects.toThrow("connection:");
    const timeout = new AbortController(); timeout.abort();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    await expect(requestSystemOne("http://local", body, new AbortController().signal)).rejects.toThrow("timeout:");
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not JSON")));
    await expect(requestSystemOne("http://local", body, new AbortController().signal)).rejects.toThrow("invalid_response:");
    await expect(requestSystemOne("http://local", { ...body, state: { ...body.state, fragment: "x".repeat(5000) } }, new AbortController().signal)).rejects.toThrow("context:");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(70_000))));
    await expect(requestSystemOne("http://local", body, new AbortController().signal)).rejects.toThrow("Oversized");
  });
  it("rejects cloud/MLX models and a cancelled request before any transport work", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const model of ["tev1:4b-cloud", "tev1:0.8b-mlx-bf16"]) await expect(requestSystemOne("http://local", { ...body, model }, new AbortController().signal)).rejects.toThrow("incompatible_model:");
    const abort = new AbortController(); abort.abort();
    await expect(requestSystemOne("http://local", body, abort.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts native HTTP work, retries cancellation on registration and rejects a late answer", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    let release!: (value: unknown) => void;
    native.invoke.mockImplementation((command: string) => command === "cancel_format_request" ? Promise.resolve() : new Promise(resolve => { release = resolve; }));
    const abort = new AbortController();
    const pending = requestSystemOne("http://local", body, abort.signal);
    const [command, args] = native.invoke.mock.calls[0];
    expect(command).toBe("system_one"); expect(args.body).toEqual(body);
    abort.abort();
    expect(native.invoke.mock.calls[1]).toEqual(["cancel_format_request", { requestId: args.requestId }]);
    args.onEvent.onmessage({ started: true });
    expect(native.invoke.mock.calls[2]).toEqual(["cancel_format_request", { requestId: args.requestId }]);
    release({ status: 200, body: JSON.stringify(response) });
    await expect(pending).rejects.toThrow();
    const count = native.invoke.mock.calls.length;
    args.onEvent.onmessage({ started: true });
    expect(native.invoke.mock.calls.length).toBe(count); // listener stopped
  });
});
