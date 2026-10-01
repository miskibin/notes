import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadPyodide } from "pyodide";

const python = await loadPyodide({ indexURL: `${resolve("public/python")}/`, stdout: () => {}, stderr: () => {} });
await python.loadPackage(["numpy", "matplotlib", "scipy"]);
python.runPython(await readFile("src/visualize/chart_runtime.py", "utf8"));
const forbidden = [
  "import os", "import js", "from pyodide.http import pyfetch", "import subprocess",
  'open("secret.txt")', 'np.loadtxt("https://example.com/data")',
  'plt.savefig("file.png")', "np.__dict__", 'getattr(np, "load")',
  "class Sneaky: pass", "global x", "import scipy._lib", "from numpy import *",
  "plt = 1", 'exec("print(1)")', "@np.vectorize\ndef f(x): return x",
  'from numpy import loadtxt as read_numbers\nread_numbers("secret.txt")',
  'from matplotlib.pyplot import savefig as export\nexport("file.png")',
];
for (const code of forbidden) {
  python.globals.set("_chart_code", code);
  assert.throws(() => python.runPython("_validate_chart(_chart_code)"), undefined, code);
}
for (const code of [
  "x = np.linspace(-3, 3, 200)\nfig, ax = plt.subplots()\nax.plot(x, scipy.stats.norm.pdf(x))\nax.set_title('Normal distribution')",
  "from scipy import integrate\nx = np.linspace(0, 3, 100)\ny = np.array([integrate.quad(lambda t: t**2, 0, v)[0] for v in x])\nfig, ax = plt.subplots()\nax.plot(x, y)",
  "from mpl_toolkits.mplot3d import Axes3D\nfig = plt.figure()\nax = fig.add_subplot(111, projection='3d')\nx = np.linspace(-2, 2, 30)\nX, Y = np.meshgrid(x, x)\nax.plot_surface(X, Y, np.sin(X) * np.cos(Y))",
  "from matplotlib.patches import FancyArrowPatch\nfig, ax = plt.subplots()\nax.add_patch(FancyArrowPatch((0.2, 0.5), (0.8, 0.5), arrowstyle='->'))\nax.text(0.1, 0.6, 'Idea')\nax.text(0.7, 0.6, 'Result')\nax.set_axis_off()",
]) {
  python.globals.set("_chart_code", code);
  const chart = JSON.parse(python.runPython("_render_chart(_chart_code)"));
  assert.ok(chart.dataUrl.startsWith("data:image/png;base64,iVBOR"));
  assert.ok(chart.width > 100 && chart.height > 100);
}
python.globals.set("_chart_code", "x = 2");
assert.throws(() => python.runPython("_render_chart(_chart_code)"), /exactly one/);
console.log(`PASS: ${forbidden.length} rejected operations; real SciPy statistics/integration, 3D surface and conceptual diagram PNGs`);
