import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, type PluginView, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutocompletePlugin, ghostKey, type CompleteBridge } from "./autocomplete";

const schema = new Schema({ nodes: {
  doc: { content: "block+" }, paragraph: { group: "block", content: "text*" },
  math_block: { group: "block", content: "text*", code: true }, text: {},
}, marks: { code: { code: true } } });

function setup(text = "Today I", node = "paragraph", code = false) {
  const complete = vi.fn<CompleteBridge["complete"]>().mockResolvedValue({ text: " write notes", truncated: false });
  const report = vi.fn();
  const bridge = { current: { enabled: true, host: "http://local", model: "test", editModel: "", complete, report, edit: async () => "" } };
  const plugin = createAutocompletePlugin(bridge);
  const content = schema.text(text, code ? [schema.marks.code.create()] : undefined);
  const doc = schema.nodes.doc.create(null, schema.nodes[node].create(null, content));
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, text.length + 1), plugins: [plugin] });
  let pluginView: PluginView | undefined;
  let focused = true;
  const view = {
    composing: false, isDestroyed: false,
    get state() { return state; }, hasFocus: () => focused,
    dispatch(tr: Transaction) { const previous = state; state = state.applyTransaction(tr).state; pluginView?.update?.(view as EditorView, previous); },
  } as EditorView;
  pluginView = plugin.spec.view!(view);
  const event = (name: string) => plugin.props.handleDOMEvents![name]!.call(plugin, view, {} as Event);
  const key = (key: string) => plugin.props.handleKeyDown!.call(plugin, view, { key, preventDefault() {} } as KeyboardEvent);
  return { view, bridge, complete, report, event, key, blur() { focused = false; event("blur"); }, destroy() { pluginView?.destroy?.(); } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autocomplete lifecycle", () => {
  it("triggers for a paused word in an already focused editor", async () => {
    const test = setup();
    await vi.advanceTimersByTimeAsync(139);
    expect(test.complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(test.complete).toHaveBeenCalledTimes(1);
    expect(ghostKey.getState(test.view.state)?.text).toBe(" write notes");
    test.destroy();
  });

  it("aborts stale work and discards out-of-order responses", async () => {
    const test = setup();
    let finish!: (result: { text: string; truncated: boolean }) => void;
    test.complete.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(140);
    const signal = test.complete.mock.calls[0][1]!;
    test.view.dispatch(test.view.state.tr.insertText(" can"));
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(140);
    finish({ text: " stale", truncated: false });
    await Promise.resolve();
    expect(ghostKey.getState(test.view.state)?.text).toBe(" write notes");
    test.destroy();
  });

  it("shows whole words before generation ends and cancels on Escape", async () => {
    const test = setup();
    test.complete.mockImplementation((_line, _signal, onProgress) => {
      onProgress?.(" write not");
      return new Promise(() => {});
    });
    await vi.advanceTimersByTimeAsync(140);
    expect(ghostKey.getState(test.view.state)?.text).toBe(" write");
    expect(test.key("Escape")).toBe(true);
    expect(test.complete.mock.calls[0][1]!.aborted).toBe(true);
    expect(ghostKey.getState(test.view.state)).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(test.complete).toHaveBeenCalledTimes(1);
    test.destroy();
  });

  it("retains the rest of a suggestion when the user types its prefix", async () => {
    const test = setup();
    await vi.advanceTimersByTimeAsync(140);
    test.view.dispatch(test.view.state.tr.insertText(" write"));
    expect(ghostKey.getState(test.view.state)?.text).toBe(" notes");
    await vi.advanceTimersByTimeAsync(500);
    expect(test.complete).toHaveBeenCalledTimes(1);
    expect(test.key("Tab")).toBe(true);
    expect(test.view.state.doc.textContent).toBe("Today I write notes");
    test.destroy();
  });

  it("retries after IME composition ends without another keystroke", async () => {
    const test = setup();
    Object.assign(test.view, { composing: true });
    test.event("compositionstart");
    await vi.advanceTimersByTimeAsync(500);
    expect(test.complete).not.toHaveBeenCalled();
    test.event("compositionend");
    Object.assign(test.view, { composing: false });
    await vi.advanceTimersByTimeAsync(200);
    expect(test.complete).toHaveBeenCalledTimes(1);
    test.destroy();
  });

  it("cancels on blur, host/model changes and destruction", async () => {
    const test = setup();
    test.complete.mockImplementation(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(140);
    const first = test.complete.mock.calls[0][1]!;
    test.bridge.current.host = "http://other";
    test.view.dispatch(test.view.state.tr.setMeta("autocomplete-config", true));
    expect(first.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(140);
    test.blur();
    expect(test.complete.mock.calls[1][1]!.aborted).toBe(true);
    test.destroy();
  });

  it("uses a cached response when revisiting the same caret context", async () => {
    const test = setup();
    await vi.advanceTimersByTimeAsync(140);
    test.view.dispatch(test.view.state.tr.setSelection(TextSelection.create(test.view.state.doc, 1)));
    test.view.dispatch(test.view.state.tr.setSelection(TextSelection.create(test.view.state.doc, 8)));
    expect(ghostKey.getState(test.view.state)?.text).toBe(" write notes");
    expect(test.complete).toHaveBeenCalledTimes(1);
    test.destroy();
  });

  it("never completes inside formula source or inline code", async () => {
    for (const test of [setup("x^2 = abc", "math_block"), setup("some code", "paragraph", true)]) {
      await vi.advanceTimersByTimeAsync(500);
      expect(test.complete).not.toHaveBeenCalled();
      test.destroy();
    }
  });

  it("solves simple arithmetic without waiting for a model", () => {
    const test = setup("2 + 2 =");
    expect(ghostKey.getState(test.view.state)?.text).toBe(" 4");
    expect(test.complete).not.toHaveBeenCalled();
    test.destroy();
  });
});
