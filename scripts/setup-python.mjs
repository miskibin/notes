import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.resolve("pyodide/package.json")));
const { version } = JSON.parse(await readFile(resolve(packageDir, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(resolve(packageDir, "pyodide-lock.json"), "utf8"));
const target = resolve("public/python");
await mkdir(target, { recursive: true });
const digest = data => createHash("sha256").update(data).digest("hex");
async function matches(path, hash) {
  try { return digest(await readFile(path)) === hash; } catch { return false; }
}
for (const name of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  const source = resolve(packageDir, name);
  if (!await matches(resolve(target, name), digest(await readFile(source)))) await copyFile(source, resolve(target, name));
}
const required = new Set();
function add(name) {
  if (required.has(name)) return;
  const item = lock.packages[name];
  if (!item) throw new Error(`Pyodide package missing: ${name}`);
  required.add(name);
  item.depends.forEach(add);
}
["numpy", "matplotlib", "scipy"].forEach(add);
const queue = [...required];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const name = queue.shift();
    const item = lock.packages[name];
    const path = resolve(target, item.file_name);
    if (await matches(path, item.sha256)) continue;
    console.log(`Preparing Python: ${name} ${item.version}`);
    const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${item.file_name}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== item.sha256) throw new Error(`Integrity check failed for ${name}`);
    await writeFile(`${path}.download`, bytes);
    await rename(`${path}.download`, path);
  }
}));
await writeFile(resolve(target, "runtime.json"), JSON.stringify({ pyodide: version, packages: [...required] }, null, 2));
console.log(`Python runtime ${version} ready (${required.size} packages; local assets, no runtime CDN requests).`);
