import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DECISION_MODELS, CRITERIA_VERSION, structureRequest, validateDecision } from "../src/structure.ts";

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const host = option("--host", "http://127.0.0.1:11434").replace(/\/+$/, "");
const models = option("--models", DECISION_MODELS.join(",")).split(",");
const split = option("--split", "evaluation");
const repeats = Number(option("--repeats", "3"));
if (!["tuning", "evaluation"].includes(split) || !Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("Use --split tuning|evaluation and --repeats 1..10.");
const examples = JSON.parse(await readFile(new URL(`../examples/structure/${split}.json`, import.meta.url), "utf8"));
const output = option("--out", "artifacts/structure-benchmark.json");
const quantile = (numbers, q) => [...numbers].sort((a, b) => a - b)[Math.ceil(numbers.length * q) - 1];
const fetchJson = async (path, body) => {
  const response = await fetch(`${host}${path}`, { redirect: "error", signal: AbortSignal.timeout(60_000),
    ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(`Ollama ${response.status}: ${data.error ?? "request failed"}`);
  return data;
};
const report = { measuredAt: new Date().toISOString(), host, split, repeats, criteriaVersion: CRITERIA_VERSION,
  policy: { minimumScore: 0.93, minimumMargin: 0.85, calibrated: false }, server: await fetchJson("/api/version"), models: [] };
for (const model of models) {
  const metadata = await fetchJson("/api/show", { model });
  if (metadata.details?.format !== "gguf") throw new Error(`${model}: compatible GGUF required. Install manually: ollama pull ${model}`);
  const start = performance.now();
  const probe = await fetchJson("/v1/systemone", structureRequest(model, { text: "The cat sleeps.", before: "", after: "", underH2: false }));
  const firstCallMs = performance.now() - start;
  if (!validateDecision(probe.answers?.structure).valid) throw new Error(`${model}: invalid synthetic choice probe`);
  let correctRaw = 0, correctPolicy = 0, proposals = 0, correctProposals = 0, abstained = 0, invalid = 0;
  const times = [], decisions = [];
  for (let repeat = 0; repeat < repeats; repeat++) for (const example of examples) {
    const request = structureRequest(model, { text: example.fragment, before: example.before, after: example.after, underH2: example.underH2 });
    const start = performance.now();
    const response = await fetchJson("/v1/systemone", request);
    const ms = performance.now() - start;
    const answer = response.answers?.structure;
    const validated = validateDecision(answer);
    times.push(ms);
    if (validated.valid && answer.choice === example.expected) correctRaw++;
    if (validated.category === example.expected) correctPolicy++;
    if (validated.abstained) abstained++;
    if (!validated.valid) invalid++;
    if (validated.category !== "keep") { proposals++; if (validated.category === example.expected) correctProposals++; }
    decisions.push({ id: example.id, language: example.language, expected: example.expected, repeat, answer, validated, ms });
  }
  const total = times.length;
  const result = { model, metadata: { details: metadata.details, capabilities: metadata.capabilities }, firstCallMs,
    firstCallNote: "Includes model loading if not already loaded; this script does not forcibly unload other users' models.",
    total, categoryAccuracy: correctRaw / total, policyAccuracy: correctPolicy / total,
    proposedChangePrecision: proposals ? correctProposals / proposals : null, proposals, abstentionRate: abstained / total,
    invalid, warmP50Ms: quantile(times, .5), warmP95Ms: quantile(times, .95), decisions };
  report.models.push(result);
  console.log(JSON.stringify({ ...result, decisions: undefined }, null, 2));
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Saved ${output}. Real API measurements; classification precision does not prove semantic correctness outside this corpus.`);
