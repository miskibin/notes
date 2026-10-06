import type { MilkdownPlugin } from "@milkdown/ctx";
import { editorViewCtx, editorViewOptionsCtx, parserCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { getMarkdown } from "@milkdown/kit/utils";
import { closeHistory } from "@milkdown/kit/prose/history";
import { AllSelection, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { blockEdit } from "@milkdown/crepe/feature/block-edit";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { placeholder } from "@milkdown/crepe/feature/placeholder";
import { table } from "@milkdown/crepe/feature/table";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef } from "react";
import { displayUrl, isTauri, saveImage } from "../vault-api";
import { autocomplete, type CompleteBridge } from "./autocomplete";
import { chartPlugins, configureChartSchema, insertChartBlock } from "./chart";
import { CHART_ICON, CHART_TEMPLATES } from "./chart-templates";
import { attachHandleDelay } from "./handle-delay";
import { inlineEdit } from "./inline-edit";
import { mathPlugins } from "./math";
import { markdownPaste } from "./paste";
import { editorShortcuts } from "./shortcuts";
import { imageDefaults } from "./images";
import type { EditorHandle, EditorHandleRef } from "./editor-handle";
import { renderedNodeNavigation } from "./rendered-nodes";
import { editorTextRange } from "./reveal-text";
import { configureWikiSerialization, wikiPlugins } from "./wiki-links";

export function NoteCanvas({
  noteKey,
  markdown,
  vault,
  bridge,
  onChange,
  editorHandle,
  readOnly = false,
  onOpenWikiLink,
}: {
  noteKey: string;
  markdown: string;
  vault: string;
  bridge: { current: CompleteBridge };
  onChange: (markdown: string) => void;
  editorHandle: EditorHandleRef;
  readOnly?: boolean;
  onOpenWikiLink?: (label: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const wikiOpenRef = useRef(onOpenWikiLink);
  const vaultRef = useRef(vault);
  const bridgeRef = useRef(bridge);
  const crepeRef = useRef<CrepeBuilder | null>(null);
  onChangeRef.current = onChange;
  wikiOpenRef.current = onOpenWikiLink;
  vaultRef.current = vault;
  bridgeRef.current = bridge;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const crepe = new CrepeBuilder({ root: host, defaultValue: markdown });
    crepeRef.current = crepe;
    if (!readOnly) crepe.addFeature(cursor);
    crepe
      .addFeature(listItem, {
        bulletIcon: "-",
        checkBoxCheckedIcon: "[x]",
        checkBoxUncheckedIcon: "[ ]",
      })
      .addFeature(linkTooltip)
      .addFeature(placeholder, { text: "Write, paste markdown, type $x^2$, or /chart", mode: "doc" })
      .addFeature(table)
      .addFeature(blockEdit, {
        buildMenu: (builder) => {
          const charts = builder.addGroup("chart", "Chart");
          for (const item of CHART_TEMPLATES) {
            charts.addItem(item.id, {
              label: item.label,
              icon: CHART_ICON,
              onRun: (ctx) => insertChartBlock(ctx, item.language, item.source),
            });
          }
        },
      })
      .addFeature(imageBlock, {
        onUpload: (file) => saveImage(vaultRef.current, file),
        inlineOnUpload: (file) => saveImage(vaultRef.current, file),
        blockOnUpload: (file) => saveImage(vaultRef.current, file),
        proxyDomURL: (url) => displayUrl(vaultRef.current, url),
      });
    crepe.editor
      .config((ctx) => {
        configureChartSchema(ctx);
        configureWikiSerialization(ctx);
        const paste = markdownPaste(ctx);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { spellcheck: "false", "aria-label": "Note editor" },
          handlePaste: (view, event, slice) => paste(view, event) || prev.handlePaste?.(view, event, slice) || false,
        }));
      })
      .use(flatPlugins(mathPlugins))
      .use(flatPlugins(chartPlugins))
      .use(flatPlugins(wikiPlugins))
      .use(imageDefaults);
    if (!readOnly) crepe.editor.use(renderedNodeNavigation).use(autocomplete(bridgeRef.current)).use(inlineEdit(bridgeRef.current)).use(editorShortcuts());
    let ready = false;
    let initialDoc: ProseNode | null = null;
    // Keep exact source at whole-document format boundaries, including after Undo/Redo.
    // Re-serializing the AST would normalize whitespace and protected Markdown.
    const sources: { doc: ProseNode; source: string }[] = [];
    const remember = (doc: ProseNode, source: string) => {
      sources.push({ doc, source });
      if (sources.length > 8) sources.shift();
    };
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, next, prev) => {
        if (!ready || cancelled || next === prev) return;
        onChangeRef.current(handle.getMarkdown());
      });
    });
    const stopHandles = attachHandleDelay(host);
    const onClick = (event: MouseEvent) => {
      const wiki = (event.target as HTMLElement | null)?.closest('[data-type="wiki-link"]');
      if (wiki && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const label = /^\[\[([^\]\n]+)\]\]$/.exec(wiki.textContent ?? "")?.[1];
        if (label) wikiOpenRef.current?.(label.trim());
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#")) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        if (isTauri()) void openUrl(href);
        else window.open(href, "_blank", "noopener");
      }
    };
    host.addEventListener("click", onClick);
    const created = crepe.create().then(() => {
      if (cancelled) return;
      initialDoc = crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
      ready = true;
      if (readOnly) crepe.setReadonly(true);
      editorHandle.current = handle;
    });
    const handle: EditorHandle = { getMarkdown: () => crepe.editor.action((ctx) => {
      const doc = ctx.get(editorViewCtx).state.doc;
      for (let i = sources.length - 1; i >= 0; i--) if (sources[i].doc.eq(doc)) return sources[i].source;
      if (initialDoc?.eq(doc)) return markdown;
      return getMarkdown()(ctx);
    }), replaceMarkdown: (next: string) => crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parsed = ctx.get(parserCtx)(next);
      if (!parsed) throw new Error("Could not parse the formatted note.");
      remember(view.state.doc, handle.getMarkdown());
      remember(parsed, next);
      view.dispatch(closeHistory(view.state.tr));
      // Parse once: Crepe can allocate different list-item attributes on each parse.
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, parsed.content));
      remember(view.state.doc, next);
      view.dispatch(closeHistory(view.state.tr));
      onChangeRef.current(handle.getMarkdown());
      view.focus();
    }),
      getSelection: (includeEmpty = false) => crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        if (from === to && !includeEmpty) return null;
        const text = view.state.doc.textBetween(from, to, "\n\n", (node) => node.textContent);
        return includeEmpty || text.trim() ? { text, from, to, document: handle.getMarkdown() } : null;
      }),
      replaceSelection: (text, selection) => crepe.editor.action((ctx) => {
        if (handle.getMarkdown() !== selection.document) throw new Error("The note changed. Select the current text again.");
        const view = ctx.get(editorViewCtx);
        const { doc } = view.state;
        const range = selection.from === 0 && selection.to === doc.content.size ? new AllSelection(doc) :
          TextSelection.between(doc.resolve(selection.from), doc.resolve(selection.to));
        view.dispatch(closeHistory(view.state.tr.setSelection(range)));
        if (text) {
          const data = new DataTransfer();
          data.setData("text/plain", text);
          view.pasteText(text, new ClipboardEvent("paste", { clipboardData: data }));
        }
        else view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
        view.dispatch(closeHistory(view.state.tr));
        onChangeRef.current(handle.getMarkdown());
        view.focus();
      }),
      selectAll: () => crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
        view.focus();
      }),
      insertAfterSelection: (next, selection) => crepe.editor.action((ctx) => {
        if (handle.getMarkdown() !== selection.document) throw new Error("The note changed. Visualize the current selection again.");
        const view = ctx.get(editorViewCtx);
        const parsed = ctx.get(parserCtx)(next);
        if (!parsed?.childCount) throw new Error("Could not insert the chart.");
        const end = view.state.doc.resolve(selection.to);
        const at = end.depth ? end.after(1) : view.state.doc.content.size;
        view.dispatch(closeHistory(view.state.tr));
        const tr = view.state.tr.insert(at, parsed.content);
        view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + parsed.content.size))).scrollIntoView());
        view.dispatch(closeHistory(view.state.tr));
        onChangeRef.current(handle.getMarkdown());
        view.focus();
      }),
      focus: () => crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus()),
      revealText: (text) => crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const range = editorTextRange(view.state.doc, text);
        if (!range) return;
        const $from = view.state.doc.resolve(range.from);
        const selection = $from.parent.type.name === "chart_block" ? NodeSelection.create(view.state.doc, $from.before()) :
          TextSelection.create(view.state.doc, range.from, range.to);
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView()); view.focus();
      }),
    };
    return () => {
      cancelled = true;
      ready = false;
      if (crepeRef.current === crepe) crepeRef.current = null;
      if (editorHandle.current === handle) editorHandle.current = null;
      stopHandles();
      host.removeEventListener("click", onClick);
      void created.finally(() => {
        void crepe.destroy().catch(() => undefined);
      });
    };
    // The editor owns this markdown until the note changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey]);

  const enabled = bridge.current.enabled;
  const model = bridge.current.model;
  const ollamaHost = bridge.current.host;
  useEffect(() => {
    if (readOnly) return;
    const editor = crepeRef.current?.editor;
    if (editor?.status !== "Created") return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta("autocomplete-config", true));
    });
  }, [enabled, model, ollamaHost, readOnly]);

  return <div className="note-canvas" ref={hostRef} spellCheck={false} />;
}

function flatPlugins(plugins: readonly unknown[]): MilkdownPlugin[] {
  const flat: MilkdownPlugin[] = [];
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) flat.push(...flatPlugins(plugin));
    else flat.push(plugin as MilkdownPlugin);
  }
  return flat;
}
