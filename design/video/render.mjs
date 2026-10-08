// Renders scene.html frame by frame through the Chrome DevTools protocol.
// Usage: node render.mjs <outDir> <first> <last> [port] [page=scene.html] [offset=0]   (FRAMES=22,37 renders just those)
// Files are named by global frame: f<frame+offset>.png, 4 digits.
// Serve this folder first (python -m http.server <port>), so WebGL can read plate.png.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outDir, a = "16", b = "107", port = "8765", page = "scene.html", offset = "0"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "tab-video-"));
const dbg = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist", "--window-size=1920,1080", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };

await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${port}/${page}` });
await sleep(1500);
console.log(await evaluate("window.ready"));
const list = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : Array.from({ length: Number(b) - Number(a) + 1 }, (_, i) => Number(a) + i);
for (const f of list) {
  await evaluate(`render(${f})`);
  await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 95 });   // jpeg keeps 1000+ frames small on disk
  writeFileSync(join(outDir, `f${String(f + Number(offset)).padStart(4, "0")}.jpg`), Buffer.from(shot.result.data, "base64"));
}
console.log(`rendered ${a}..${b}`);
ws.close(); chrome.kill(); await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
