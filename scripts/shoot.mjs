// Dev tool: screenshots pages at exact scroll positions via the Chrome DevTools protocol.
// No dependencies (Node >= 22 has WebSocket). Usage:
//   node scripts/shoot.mjs <outDir> <url> <width>x<height> <scroll>[,<scroll>...] [prefix]
// scroll: a pixel offset, "p0.5" (fraction of the .stage scroll range), or "#id" (scroll element into view).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outDir, url, size, scrolls = "0", prefix = "shot"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "tab-shoot-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--use-angle=d3d11", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
// Local dev only: SESSION_WALLET=<address> signs a dashboard session cookie with TAB/.env's SESSION_SECRET.
if (process.env.SESSION_WALLET) {
  const { readFileSync } = await import("node:fs");
  const { createHmac } = await import("node:crypto");
  const secret = readFileSync(".env", "utf8").match(/^SESSION_SECRET=(.+)$/m)?.[1]?.trim();
  const body = Buffer.from(JSON.stringify({ w: process.env.SESSION_WALLET, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  await send("Network.enable");
  await send("Network.setCookie", { name: "tab_session", value: `${body}.${mac}`, url: new URL(url).origin, httpOnly: true });
}
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3500);
// Optional real mouse drag before shooting: DRAG="x1,y1;x2,y2;..." (viewport px).
if (process.env.DRAG) {
  const pts = process.env.DRAG.split(";").map((p) => p.split(",").map(Number));
  const ev = (type, [x, y], buttons) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
  await ev("mouseMoved", pts[0], 0);
  await ev("mousePressed", pts[0], 1);
  for (const p of pts.slice(1)) { await ev("mouseMoved", p, 1); await sleep(40); }
  await ev("mouseReleased", pts[pts.length - 1], 0);
  await sleep(400);
  console.log("after drag:", await evaluate(`JSON.stringify({value: document.querySelector('.dial-value')?.value, aria: document.querySelector('.dial')?.getAttribute('aria-valuetext'), total: document.querySelector('.receipt-line .total')?.textContent})`));
}
// Optional page script before shooting (local dev checks), e.g. EVAL="document.querySelector('#try button')?.click()".
if (process.env.EVAL) { await evaluate(process.env.EVAL); await sleep(Number(process.env.EVAL_WAIT ?? 1000)); }
const out = [];
for (const s of scrolls.split(",")) {
  const js = s.startsWith("#") ? `document.querySelector(${JSON.stringify(s)})?.scrollIntoView()`
    : s.startsWith("p") ? `(()=>{const st=document.querySelector('.stage');scrollTo(0, ${Number(s.slice(1))} * (st.offsetHeight - innerHeight));})()`
    : `scrollTo(0, ${Number(s)})`;
  await evaluate(js);
  await sleep(1200);
  const metrics = await evaluate(`JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,y:Math.round(scrollY)})`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${prefix}-${s.replace(/[^a-z0-9.]/gi, "_")}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  out.push(`${file} ${metrics}`);
}
console.log(out.join("\n"));
ws.close(); chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
