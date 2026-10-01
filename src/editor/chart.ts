import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { textblockTypeInputRule } from "@milkdown/kit/prose/inputrules";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { clearTextInCurrentBlockCommand, codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $inputRule, $view } from "@milkdown/kit/utils";
import type { View } from "vega";
import { chartLanguage, compileChartSource, paramNames, writeParamValues } from "./chart-dsl";

const vegaLiteInput = $inputRule((ctx) =>
  textblockTypeInputRule(/^```(?<language>[a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s\n]$/, codeBlockSchema.type(ctx), (match) => ({
    language: match.groups?.language ?? "",
  })),
);

const chartNodeView = $view(codeBlockSchema.node, () => {
  return (node, view, getPos) => {
    if (chartLanguage(String(node.attrs.language ?? ""))) return new ChartView(node, view, getPos);
    return plainCodeView(node);
  };
});

export const chartPlugins = [vegaLiteInput, chartNodeView];

export function insertChartBlock(ctx: Ctx, language: string, source: string) {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);
  commands.call(clearTextInCurrentBlockCommand.key);
  const state = view.state;
  const $from = state.selection.$from;
  if ($from.depth < 1) return;
  const type = codeBlockSchema.type(ctx);
  const node = type.create({ language }, state.schema.text(source));
  view.dispatch(state.tr.replaceWith($from.before(1), $from.after(1), node).scrollIntoView());
}

class ChartView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseNode;
  private textarea: HTMLTextAreaElement;
  private mount: HTMLDivElement;
  private message: HTMLParagraphElement;
  private details: HTMLDetailsElement;
  private saveButton: HTMLButtonElement;
  private renderedSource = "";
  private token = 0;
  private local = false;
  private finalize: (() => void) | null = null;
  private vegaView: View | null = null;
  private timer = 0;

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement("div");
    this.dom.className = "chart-block";
    this.dom.setAttribute("contenteditable", "false");

    this.mount = document.createElement("div");
    this.mount.className = "chart-mount";
    this.message = document.createElement("p");
    this.message.className = "chart-message";
    this.message.setAttribute("role", "status");
    this.message.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "chart-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Source";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    this.saveButton = document.createElement("button");
    this.saveButton.type = "button";
    this.saveButton.textContent = "Save as default";
    this.saveButton.disabled = true;
    actions.append(edit, reset, this.saveButton);

    this.details = document.createElement("details");
    this.details.className = "chart-source";
    const summary = document.createElement("summary");
    summary.textContent = "Source";
    this.textarea = document.createElement("textarea");
    this.textarea.setAttribute("aria-label", "Chart source");
    this.textarea.spellcheck = false;
    this.textarea.value = node.textContent;
    this.details.append(summary, this.textarea);

    const hole = document.createElement("pre");
    hole.className = "chart-hole";
    hole.hidden = true;
    this.contentDOM = document.createElement("code");
    hole.append(this.contentDOM);

    this.dom.append(this.mount, this.message, actions, this.details, hole);

    edit.addEventListener("click", () => {
      this.details.open = !this.details.open;
      if (this.details.open) this.textarea.focus();
    });
    this.textarea.addEventListener("input", () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.commitSource(), 180);
    });
    this.textarea.addEventListener("blur", () => {
      window.clearTimeout(this.timer);
      this.commitSource();
    });
    reset.addEventListener("click", () => void this.render(this.textarea.value));
    this.saveButton.addEventListener("click", () => this.saveDefaults());

    if (!node.textContent.trim()) this.details.open = true;
    void this.render(node.textContent);
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    if (!chartLanguage(String(node.attrs.language ?? ""))) return false;
    this.node = node;
    if (this.local) return true;
    if (node.textContent !== this.textarea.value) this.textarea.value = node.textContent;
    if (node.textContent !== this.renderedSource) void this.render(node.textContent);
    return true;
  }

  stopEvent(event: Event) {
    const target = event.target;
    return target instanceof Element && !!target.closest("input, textarea, select, button, .vega-bind, .chart-source");
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if (mutation.type === "selection") return true;
    return !this.contentDOM.contains(mutation.target);
  }

  destroy() {
    this.token += 1;
    window.clearTimeout(this.timer);
    this.finalize?.();
    this.finalize = null;
    this.vegaView = null;
  }

  private commitSource() {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    const next = this.textarea.value;
    if (next === node.textContent) {
      void this.render(next);
      return;
    }
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    let tr = this.view.state.tr;
    if (to > from) tr = tr.delete(from, to);
    if (next) tr = tr.insert(from, this.view.state.schema.text(next));
    this.local = true;
    this.view.dispatch(tr);
    this.local = false;
    void this.render(next);
  }

  private saveDefaults() {
    const view = this.vegaView;
    if (!view) return;
    const language = String(this.node.attrs.language ?? "");
    const source = this.textarea.value;
    const values: Record<string, unknown> = {};
    for (const name of paramNames(language, source)) {
      try {
        const value = view.signal(name);
        values[name] = typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10000) / 10000 : value;
      } catch {
        /* a param that is not a signal yet */
      }
    }
    if (!Object.keys(values).length) return;
    try {
      this.textarea.value = writeParamValues(language, source, values);
    } catch {
      this.message.textContent = "Couldn't write the slider values back.";
      return;
    }
    this.commitSource();
  }

  private async render(source: string) {
    const token = ++this.token;
    this.finalize?.();
    this.finalize = null;
    this.vegaView = null;
    this.saveButton.disabled = true;
    this.mount.replaceChildren();
    const compiled = compileChartSource(String(this.node.attrs.language ?? ""), source);
    if (token !== this.token) return;
    if ("error" in compiled) {
      this.renderedSource = source;
      this.message.textContent = compiled.error;
      this.details.open = true;
      return;
    }
    this.message.textContent = "Loading chart…";
    try {
      const { default: embed } = await import("vega-embed");
      if (token !== this.token) return;
      const mode = document.documentElement.dataset.colorMode === "light" ? undefined : "dark";
      const tokens = getComputedStyle(document.documentElement);
      const muted = tokens.getPropertyValue("--muted-foreground").trim();
      const border = tokens.getPropertyValue("--border").trim();
      const result = await embed(this.mount, compiled.spec as never, {
        actions: false,
        renderer: "svg",
        theme: mode,
        config: {
          background: "transparent",
          view: { stroke: null },
          axis: {
            labelColor: muted,
            titleColor: muted,
            labelFont: "Segoe UI",
            titleFont: "Segoe UI",
            titleFontWeight: "normal",
            gridColor: border,
            gridOpacity: 0.5,
            domain: false,
            ticks: false,
            labelPadding: 8,
            titlePadding: 12,
          },
          legend: { labelColor: muted, titleColor: muted },
        },
      });
      if (token !== this.token) {
        result.finalize();
        return;
      }
      this.finalize = result.finalize;
      this.message.textContent = "";
      this.vegaView = result.view;
      this.renderedSource = source;
      this.saveButton.disabled = paramNames(String(this.node.attrs.language ?? ""), source).length === 0;
    } catch (error) {
      if (token !== this.token) return;
      this.message.textContent = error instanceof Error ? error.message : "Couldn't draw the chart.";
      this.details.open = true;
    }
  }
}

function plainCodeView(node: ProseNode): NodeView {
  const dom = document.createElement("pre");
  const contentDOM = document.createElement("code");
  const language = String(node.attrs.language ?? "");
  if (language) dom.dataset.language = language;
  dom.append(contentDOM);
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      if (chartLanguage(String(next.attrs.language ?? ""))) return false;
      const lang = String(next.attrs.language ?? "");
      if (lang) dom.dataset.language = lang;
      else delete dom.dataset.language;
      return true;
    },
  };
}
