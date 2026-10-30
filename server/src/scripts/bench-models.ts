/**
 * Model benchmark: captures the app's real Nemotron requests from a live solo plan and a live
 * two-person plan, then replays them on each Nemotron model on Token Factory (reasoning off/on),
 * checking that replies parse and only use Qloo candidate IDs. Run from server/: npm run bench
 * Results: devpost/model-benchmark.md documents the run used for routing decisions.
 */
// @ts-nocheck
const captured: any[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (u: any, init: any) => {
  if (String(u).includes("nebius") && init?.body) captured.push(JSON.parse(init.body));
  return real(u, init);
}) as any;
const { presets } = await import("../data/profile.js");
const { planEvening } = await import("../services/planner.js");
await planEvening("A rainy Sunday date night, something romantic, $60 CAD", [presets.cozy], { liked: [], disliked: [] });
const mood1 = captured.find((b) => b.tools);
const soloSel = captured.find((b) => b.response_format?.json_schema?.name === "evening_plan");
captured.length = 0;
await planEvening("Date night on Saturday, something fun but cozy, $60 CAD", [presets.cozy, presets.partner], { liked: [], disliked: [] });
const duoSel = captured.find((b) => b.response_format?.json_schema?.name === "evening_plan");
globalThis.fetch = real;
const bodies = { mood1, soloSel, duoSel };
const MODELS = ["nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", "nvidia/Nemotron-3_5-Lightning", "nvidia/nemotron-3-super-120b-a12b", "nvidia/Nemotron-3-Ultra-550b-a55b"];
const RUNS = Number(process.env.RUNS ?? 2);
async function call(body, timeout = 150000) {
  const t = Date.now();
  try {
    const r = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    const j = await r.json(); return { ms: Date.now() - t, status: r.status, j };
  } catch (e) { return { ms: Date.now() - t, status: 0, err: e.name }; }
}
function allowedIds(body) {
  const txt = body.messages[1].content; const out = { movie: new Set(), dinner: new Set(), playlist: new Set() }; let cur = null;
  for (const line of txt.split("\n")) {
    if (/^MOVIE candidates/.test(line)) cur = "movie"; else if (/^DINNER candidates/.test(line)) cur = "dinner"; else if (/^ARTIST candidates/.test(line)) cur = "playlist"; else if (/^\S/.test(line) && !line.startsWith("- ")) cur = cur && line.startsWith("-") ? cur : (line.endsWith(":") ? null : cur);
    const m = line.match(/^- ([A-Za-z0-9-]{20,}) \|/); if (m && cur) out[cur].add(m[1]);
  }
  return out;
}
function checkSelection(body, j) {
  const content = j?.choices?.[0]?.message?.content; if (typeof content !== "string") return { valid: false, why: `no content (${j?.choices?.[0]?.finish_reason ?? j?.error?.message ?? "?"})` };
  let p; try { p = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)); } catch { return { valid: false, why: "bad json" }; }
  const a = allowedIds(body);
  const ok = a.movie.has(p.movie?.id) && a.dinner.has(p.dinner?.id) && Array.isArray(p.playlist?.artistIds) && p.playlist.artistIds.length >= 3 && p.playlist.artistIds.every((x) => a.playlist.has(x));
  return { valid: ok, why: ok ? "" : "id outside candidates", reasons: [p.movie?.reason, p.dinner?.reason, p.playlist?.reason] };
}
const variants = [];
for (const model of MODELS) {
  variants.push({ step: "mood tool call", model, thinking: false, body: { ...bodies.mood1, model, chat_template_kwargs: { enable_thinking: false } }, kind: "mood" });
  for (const [step, b] of [["solo selection", bodies.soloSel], ["duo selection", bodies.duoSel]]) {
    variants.push({ step, model, thinking: false, body: { ...b, model, chat_template_kwargs: { enable_thinking: false } }, kind: "sel" });
    if (step === "duo selection") variants.push({ step, model, thinking: true, body: { ...b, model, max_tokens: 12000, chat_template_kwargs: { enable_thinking: true } }, kind: "sel" });
  }
}
const rows = await Promise.all(MODELS.map(async (model) => {
  const out = [];
  for (const v of variants.filter((x) => x.model === model)) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await call(v.body);
      if (v.kind === "mood") { const calls = r.j?.choices?.[0]?.message?.tool_calls ?? []; runs.push({ ms: r.ms, valid: calls.length > 0, why: calls.length ? "" : (r.err ?? `no tool calls ${r.status}`), detail: calls.map((c) => JSON.parse(c.function.arguments).query).join(", ") }); }
      else { const c = checkSelection(v.body, r.j); runs.push({ ms: r.ms, ...c, why: c.why || (r.err ?? "") }); }
    }
    out.push({ step: v.step, model: v.model.replace("nvidia/", ""), thinking: v.thinking, runs });
  }
  return out;
}));
const flat = rows.flat();
for (const r of flat) {
  const ok = r.runs.filter((x) => x.valid).length; const ms = r.runs.map((x) => x.ms); const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
  console.log(`${r.step.padEnd(15)} ${r.model.padEnd(36)} thinking=${r.thinking ? "on " : "off"} valid ${ok}/${r.runs.length}  avg ${(avg / 1000).toFixed(1)}s  ${r.runs.map((x) => x.why || x.detail || "").filter(Boolean).join(" | ").slice(0, 90)}`);
}
