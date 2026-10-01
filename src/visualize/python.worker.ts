import type { PyodideInterface } from "pyodide";
import runtime from "./chart_runtime.py?raw";

type Request = { code: string; indexURL: string };
const worker = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };

worker.onmessage = async ({ data }) => {
  try {
    worker.postMessage({ type: "progress", message: "Loading plotting libraries…" });
    const { loadPyodide } = await import(/* @vite-ignore */ `${data.indexURL}pyodide.mjs`) as {
      loadPyodide: (options: unknown) => Promise<PyodideInterface>;
    };
    const python = await loadPyodide({ indexURL: data.indexURL, stdout: () => {}, stderr: () => {} });
    await python.loadPackage(["matplotlib", "numpy", "scipy"]);
    // Package downloads finish before user code runs. Disable worker network channels.
    for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) {
      Object.defineProperty(self, name, { value: () => { throw new Error("Network access is disabled for chart code."); }, writable: false, configurable: false });
    }
    python.runPython(runtime);
    python.globals.set("_chart_code", data.code);
    worker.postMessage({ type: "running", message: "Drawing the chart…" });
    const chart = JSON.parse(python.runPython("_render_chart(_chart_code)") as string) as unknown;
    worker.postMessage({ type: "result", chart });
  } catch (error) {
    worker.postMessage({ type: "error", message: error instanceof Error ? error.message.slice(-2200) : String(error) });
  }
};
