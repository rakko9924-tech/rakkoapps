// promo/render-still.mjs — HTMLを指定サイズでPNGに焼く（YouTubeのバナー・サムネ用）
// 使い方: node promo/render-still.mjs promo/banner.html 2048 1152 promo/out/youtube-banner.png
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , htmlRel, wArg, hArg, outRel] = process.argv;
if (!htmlRel || !outRel) { console.error('usage: node promo/render-still.mjs <html> <w> <h> <out.png>'); process.exit(1); }
const W = Number(wArg), H = Number(hArg);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5352, DBG = 9362;
const ROOT = path.join(os.homedir(), 'apps/rakko-apps-site');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(path.dirname(path.join(ROOT, outRel)), { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, r));

const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--force-device-scale-factor=1',
  `--user-data-dir=${ROOT}/promo/prof-still`, `--remote-debugging-port=${DBG}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(300);
  try { const list = await (await fetch(`http://localhost:${DBG}/json`)).json(); const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch {}
}
if (!wsUrl) { console.error('no devtools'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map(); const loadWaiters = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Page.loadEventFired') { while (loadWaiters.length) loadWaiters.shift()(); } };
const send = (method, params = {}) => new Promise((res) => { const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJS = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
const val = (r) => r?.result?.result?.value ?? r?.result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const loaded = new Promise(r => loadWaiters.push(r));
await send('Page.navigate', { url: `http://localhost:${PORT}/${htmlRel}?cb=${Date.now()}` });
await loaded;
for (let i = 0; i < 60; i++) { if (val(await evalJS('window.__ready===true'))) break; await sleep(150); }
await evalJS('document.fonts.ready');
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(ROOT, outRel), Buffer.from(shot.result.data, 'base64'));
ws.close(); chrome.kill(); server.close();
console.log('OUT:', path.join(ROOT, outRel));
process.exit(0);
