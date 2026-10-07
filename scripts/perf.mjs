// Dev tool: measures scroll smoothness of a page via the Chrome DevTools protocol.
// Scrolls the landing page in small steps, one per animation frame, and reports how many frames
// blew the 16.7ms budget, plus paint/layout counts. CPU throttled 4x to approximate a weak laptop.
// Usage: node scripts/perf.mjs <url> [width]x[height]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, size = "1440x900"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "tab-perf-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
await send("Performance.enable");
await send("Page.enable");
await send("Page.navigate", { url });
// Wait until the hero exists and its entrance finished, so we time scrolling, not first render.
for (let i = 0; i < 60; i++) {
  if (await evaluate(`!!document.querySelector('.stage') && !!document.querySelector('.landing.ready')`)) break;
  await sleep(250);
}
await sleep(2000);
const m0 = Object.fromEntries((await send("Performance.getMetrics")).result.metrics.map((m) => [m.name, m.value]));
const res = await evaluate(`new Promise((resolve) => {
  const st = document.querySelector('.stage');
  const end = st ? st.offsetHeight : 3000;
  const step = 24; let y = 0; const times = []; let last = performance.now();
  function tick(t) {
    times.push(t - last); last = t;
    y += step; scrollTo(0, y);
    if (y < end) requestAnimationFrame(tick); else resolve(times.slice(2));
  }
  requestAnimationFrame(tick);
})`);
const m1 = Object.fromEntries((await send("Performance.getMetrics")).result.metrics.map((m) => [m.name, m.value]));
const frames = res.length, slow = res.filter((t) => t > 20).length, worst = Math.max(...res);
const avg = res.reduce((a, b) => a + b, 0) / frames;
console.log(JSON.stringify({
  frames, avgFrameMs: +avg.toFixed(1), slowFramesPct: +((slow / frames) * 100).toFixed(1), worstMs: +worst.toFixed(0),
  layouts: m1.LayoutCount - m0.LayoutCount, styleRecalcs: m1.RecalcStyleCount - m0.RecalcStyleCount,
  scriptMs: +((m1.ScriptDuration - m0.ScriptDuration) * 1000).toFixed(0), layoutMs: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(0),
  taskMs: +((m1.TaskDuration - m0.TaskDuration) * 1000).toFixed(0),
}));
ws.close(); chrome.kill(); await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
