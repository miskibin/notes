import { afterEach, describe, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: bridge.invoke,
  Channel: class { onmessage?: (event: unknown) => void },
}));
import { completeLine } from "./vault-api";

afterEach(() => { vi.unstubAllGlobals(); bridge.invoke.mockReset(); });

describe("native completion cancellation", () => {
  it("repeats cancellation after registration and suppresses late progress", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    let finish!: (result: { text: string; truncated: boolean }) => void;
    let events!: { onmessage: (event: { text?: string; started?: boolean }) => void };
    bridge.invoke.mockImplementation((command, args) => {
      if (command === "cancel_completion") return Promise.resolve();
      events = args.onEvent;
      return new Promise(resolve => { finish = resolve; });
    });
    const controller = new AbortController(), progress = vi.fn();
    const result = completeLine("http://local", "demo", "Today I", controller.signal, progress);
    events.onmessage({ text: " first" });
    expect(progress).toHaveBeenCalledWith(" first");
    controller.abort();
    events.onmessage({ started: true });
    events.onmessage({ text: " stale" });
    expect(bridge.invoke.mock.calls.filter(([command]) => command === "cancel_completion")).toHaveLength(2);
    expect(progress).toHaveBeenCalledTimes(1);
    finish({ text: " stale", truncated: false });
    await expect(result).rejects.toThrow();
    events.onmessage({ text: " too late" });
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it("never starts a request for an already aborted signal", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const controller = new AbortController(); controller.abort();
    await expect(completeLine("http://local", "demo", "hello", controller.signal)).rejects.toThrow();
    expect(bridge.invoke).not.toHaveBeenCalled();
  });
});
