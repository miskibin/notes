export type ChartImage = { dataUrl: string; width: number; height: number };

export function renderPythonChart(code: string, signal: AbortSignal, onProgress: (message: string) => void): Promise<ChartImage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const worker = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });
    let timer = 0;
    let settled = false;
    const finish = (error?: Error, chart?: ChartImage) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(chart!);
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const deadline = (ms: number, message: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(new Error(message)), ms);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(new Error("The plotting worker could not start. Rebuild the app with npm run setup:python."));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress" || data.type === "running") {
        onProgress(data.message);
        if (data.type === "running") deadline(20_000, "The chart took too long to compute. Try a simpler idea.");
      } else if (data.type === "error") finish(new Error(data.message));
      else if (data.type === "result") {
        const chart = data.chart as ChartImage;
        if (typeof chart?.dataUrl !== "string" || !chart.dataUrl.startsWith("data:image/png;base64,iVBOR") ||
            chart.dataUrl.length > 9_000_000 || !Number.isInteger(chart.width) || !Number.isInteger(chart.height) ||
            chart.width < 1 || chart.height < 1 || chart.width > 2400 || chart.height > 2400) {
          finish(new Error("The plotting worker returned an invalid image."));
        } else finish(undefined, chart);
      }
    };
    deadline(120_000, "Plotting libraries did not load in time. Rebuild the app with npm run setup:python.");
    worker.postMessage({ code, indexURL: new URL("./python/", document.baseURI).href });
  });
}
