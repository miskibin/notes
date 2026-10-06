import { describe, expect, it, vi } from "vitest";
import { createGlassController } from "./window-glass";
import { normalizeSettings } from "./settings";

describe("experimental frosted glass", () => {
  it("migrates the removed experiment to opaque", () => {
    expect(normalizeSettings({}).frostedGlass).toBe(false);
    expect(normalizeSettings({ frostedGlass: true }).frostedGlass).toBe(false);
    expect(normalizeSettings({ frostedGlass: "true" as unknown as boolean }).frostedGlass).toBe(false);
  });
  it("does not call native effects for the default mode", async () => {
    const adapter = { apply: vi.fn(), clear: vi.fn() }, surface = vi.fn();
    await createGlassController(adapter, surface).request(false, true);
    expect(adapter.apply).not.toHaveBeenCalled(); expect(adapter.clear).not.toHaveBeenCalled();
    expect(surface).toHaveBeenLastCalledWith(false);
  });
  it("a late enable cannot defeat a newer disable", async () => {
    let release!: () => void;
    const adapter = { apply: vi.fn(() => new Promise<void>(resolve => { release = resolve; })), clear: vi.fn(async () => {}) };
    const surface = vi.fn(), controller = createGlassController(adapter, surface);
    const enable = controller.request(true, true);
    await Promise.resolve();
    const disable = controller.request(false, true);
    release(); await Promise.all([enable, disable]);
    expect(adapter.clear).toHaveBeenCalledOnce(); expect(surface).not.toHaveBeenCalledWith(true);
    expect(surface).toHaveBeenLastCalledWith(false);
  });
  it("failed effects restore an opaque surface and report the cause", async () => {
    const adapter = { apply: vi.fn(async () => { throw new Error("OS unsupported"); }), clear: vi.fn(async () => {}) }, surface = vi.fn();
    const result = await createGlassController(adapter, surface).request(true, false);
    expect(result).toContain("OS unsupported"); expect(adapter.clear).toHaveBeenCalledOnce();
    expect(surface).not.toHaveBeenCalledWith(true);
  });
});
