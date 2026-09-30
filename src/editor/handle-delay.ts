const DELAY_MS = 200;

/** Crepe's BlockProvider ignores `shouldShow`, and its handle slides in on `transition: all`. */
export function attachHandleDelay(scope: HTMLElement): () => void {
  let timer = 0;
  let anchor = "";

  const sync = () => {
    const handle = scope.querySelector<HTMLElement>(".milkdown-block-handle");
    if (!handle) return;
    const shown = handle.dataset.show === "true";
    const place = `${handle.style.top}|${handle.style.left}`;
    if (!shown) {
      window.clearTimeout(timer);
      anchor = "";
      handle.classList.remove("is-ready");
      return;
    }
    if (place === anchor && handle.classList.contains("is-ready")) return;
    if (place !== anchor) {
      anchor = place;
      handle.classList.remove("is-ready");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (handle.dataset.show === "true" && `${handle.style.top}|${handle.style.left}` === place) {
          handle.classList.add("is-ready");
        }
      }, DELAY_MS);
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(scope, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-show", "style"],
  });
  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}
