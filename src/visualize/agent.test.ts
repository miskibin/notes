import { describe, expect, it, vi } from "vitest";
import { runChartAgent, type AgentUpdate } from "./agent";

const recipe = { title: "Data", caption: "Provided values", kind: "data", code: "fig, ax = plt.subplots()\nax.plot([1, 2])" };
const raw = JSON.stringify(recipe);
const image = { dataUrl: "data:image/png;base64,iVBOR", width: 800, height: 450 };
function setup() {
  const controller = new AbortController();
  const updates: AgentUpdate[] = [];
  const options = { host: "http://localhost:11434", model: "test", idea: "Values: 1, 2", signal: controller.signal, onUpdate: (update: AgentUpdate) => updates.push(update) };
  const request = vi.fn().mockResolvedValue(raw), render = vi.fn().mockResolvedValue(image);
  return { controller, updates, options, request, render };
}
describe("bounded chart agent", () => {
  it("passes the failing response and concrete Python error back to the model", async () => {
    const s = setup();
    const broken = JSON.stringify({ ...recipe, code: "ax.plot(missing)" });
    s.request.mockResolvedValueOnce(broken);
    s.render.mockRejectedValueOnce(new Error("NameError: missing is not defined"));
    expect(await runChartAgent(s.options, s)).toEqual({ recipe, image });
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.request.mock.calls[1][4]).toEqual({ previousResponse: broken, error: "NameError: missing is not defined" });
    const trace = s.updates[s.updates.length - 1].steps;
    expect(trace.map(step => step.status)).toEqual(["done", "error", "done", "done"]);
    expect(JSON.parse(trace[2].input).messages[2].content).toBe(broken);
    expect(trace[3].input).toBe(recipe.code);
    expect(trace.every(step => step.elapsed != null)).toBe(true);
    expect(s.updates[0].steps[0].status).toBe("running"); // earlier snapshots are immutable
  });
  it("repairs malformed JSON before calling Python", async () => {
    const s = setup(); s.request.mockResolvedValueOnce("not JSON");
    await runChartAgent(s.options, s);
    expect(s.render).toHaveBeenCalledTimes(1);
    expect(s.request.mock.calls[1][4].previousResponse).toBe("not JSON");
  });
  it("stops after three failures, without an unbounded agent loop", async () => {
    const s = setup(); s.render.mockRejectedValue(new Error("Unsupported import: os"));
    await expect(runChartAgent(s.options, s)).rejects.toThrow("after 3 attempts");
    expect(s.request).toHaveBeenCalledTimes(3); expect(s.render).toHaveBeenCalledTimes(3);
  });
  it("retains partial output when the connection fails", async () => {
    const s = setup();
    s.request.mockImplementation(async (...args) => { args[5]("partial Python"); throw new Error("Disconnected"); });
    await expect(runChartAgent(s.options, s)).rejects.toThrow("Disconnected");
    const step = s.updates[s.updates.length - 1].steps[0];
    expect(step.output).toBe("partial Python"); expect(step.error).toBe("Disconnected");
    expect(s.render).not.toHaveBeenCalled();
  });
  it("does not blindly retry connection failures", async () => {
    const s = setup(); s.request.mockRejectedValue(new Error("Ollama offline"));
    await expect(runChartAgent(s.options, s)).rejects.toThrow("offline");
    expect(s.request).toHaveBeenCalledTimes(1); expect(s.render).not.toHaveBeenCalled();
  });
  it("ignores late responses after cancellation and never executes their code", async () => {
    const s = setup(); s.request.mockImplementation(async () => { s.controller.abort(); return raw; });
    await expect(runChartAgent(s.options, s)).rejects.toMatchObject({ name: "AbortError" });
    expect(s.render).not.toHaveBeenCalled();
  });
  it("does not start a repair after a cancelled worker", async () => {
    const s = setup(); s.render.mockImplementation(async () => { s.controller.abort(); throw new Error("Cancelled"); });
    await expect(runChartAgent(s.options, s)).rejects.toMatchObject({ name: "AbortError" });
    expect(s.request).toHaveBeenCalledTimes(1);
  });
});
