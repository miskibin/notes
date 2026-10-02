import { afterEach, describe, expect, it, vi } from "vitest";
import { chartMarkdown, parseRecipe, validateIdea } from "./recipe";
import { requestChart, visualizeIdea } from "../vault-api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";

const recipe = { title: "Rozkład normalny", caption: "Przykład: średnia 0 i odchylenie 1.", kind: "illustrative", code: "x = np.linspace(-4, 4, 200)\nfig, ax = plt.subplots()\nax.plot(x, scipy.stats.norm.pdf(x))" };
afterEach(() => vi.unstubAllGlobals());

describe("visualization recipe", () => {
  it("validates selected text and rejects malformed or oversized code", () => {
    expect(() => validateIdea(" ")).toThrow("Select");
    expect(() => validateIdea("x".repeat(12_001))).toThrow("shorter");
    expect(parseRecipe(JSON.stringify(recipe))).toEqual(recipe);
    expect(() => parseRecipe("bad JSON")).toThrow("invalid chart JSON");
    expect(() => parseRecipe(JSON.stringify({ ...recipe, kind: "real" }))).toThrow("identify");
    expect(() => parseRecipe(JSON.stringify({ ...recipe, code: "x".repeat(20_001) }))).toThrow("too long");
    expect(() => parseRecipe(JSON.stringify({ ...recipe, caption: "" }))).toThrow("missing");
  });
  it("escapes generated labels and captions instead of interpreting them as Markdown", () => {
    const md = chartMarkdown({ ...recipe, kind: "illustrative", title: "x] [click", caption: "[link](https://example.org) *value*" }, "assets/chart.png");
    expect(md).toContain("![x   click](assets/chart.png)");
    expect(md).toContain("Illustrative · ");
    expect(md).toContain("\\[link\\]");
    expect(md).toContain("\\*value\\*");
  });
  it("sends only the selected idea to the configured edit model", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(recipe) }, done_reason: "stop" })));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    expect(await visualizeIdea("http://localhost:11434/", "edit-model", "Rozkład normalny", controller.signal)).toEqual(recipe);
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.model).toBe("edit-model");
    expect(payload.format).toBe("json");
    expect(payload.messages[1].content).toBe("Visualize this idea:\n\nRozkład normalny");
    expect(payload.messages[0].content).toContain("SciPy");
  });
  it("never uses partial code after token exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(recipe) }, done_reason: "length" }))));
    await expect(visualizeIdea("http://localhost", "edit", "idea", new AbortController().signal)).rejects.toThrow("before finishing");
  });
  it("sends repair context through the desktop bridge and ignores cancelled responses", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const native = vi.mocked(invoke);
    native.mockResolvedValue(JSON.stringify(recipe));
    const controller = new AbortController();
    const repair = { previousResponse: "broken JSON", error: "Invalid JSON" };
    expect(await requestChart("http://localhost", "edit", "idea", controller.signal, repair)).toBe(JSON.stringify(recipe));
    expect(native).toHaveBeenLastCalledWith("visualize_selection", { host: "http://localhost", model: "edit", text: "idea", previousResponse: "broken JSON", repairError: "Invalid JSON" });
    native.mockImplementationOnce(async () => { controller.abort(); return JSON.stringify(recipe); });
    await expect(requestChart("http://localhost", "edit", "idea", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

});
