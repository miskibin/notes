import type { MilkdownPlugin } from "@milkdown/ctx";
import { editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { getMarkdown } from "@milkdown/kit/utils";
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
import { chartPlugins, insertChartBlock } from "./chart";
import { CHART_ICON, CHART_TEMPLATES } from "./chart-templates";
import { attachHandleDelay } from "./handle-delay";
import { inlineEdit } from "./inline-edit";
import { mathPlugins } from "./math";
import { markdownPaste } from "./paste";
import { editorShortcuts } from "./shortcuts";
import type { EditorHandleRef } from "./editor-handle";

export function NoteCanvas({
  noteKey,
  markdown,
  vault,
  bridge,
  onChange,
  editorHandle,
}: {
  noteKey: string;
  markdown: string;
  vault: string;
  bridge: { current: CompleteBridge };
  onChange: (markdown: string) => void;
  editorHandle: EditorHandleRef;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const vaultRef = useRef(vault);
  const bridgeRef = useRef(bridge);
  onChangeRef.current = onChange;
  vaultRef.current = vault;
  bridgeRef.current = bridge;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const crepe = new CrepeBuilder({ root: host, defaultValue: markdown });
    crepe
      .addFeature(cursor)
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
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { spellcheck: "false", "aria-label": "Note editor" },
        }));
      })
      .use(flatPlugins(mathPlugins))
      .use(flatPlugins(chartPlugins))
      .use(markdownPaste)
      .use(autocomplete(bridgeRef.current))
      .use(inlineEdit(bridgeRef.current))
      .use(editorShortcuts());
    let ready = false;
    let initialDoc: ProseNode | null = null;
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, next, prev) => {
        if (!ready || cancelled || next === prev) return;
        onChangeRef.current(handle.getMarkdown());
      });
    });
    const stopHandles = attachHandleDelay(host);
    const onClick = (event: MouseEvent) => {
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
      editorHandle.current = handle;
    });
    const handle = { getMarkdown: () => crepe.editor.action((ctx) => {
      if (initialDoc?.eq(ctx.get(editorViewCtx).state.doc)) return markdown;
      return getMarkdown()(ctx);
    }) };
    return () => {
      cancelled = true;
      ready = false;
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
