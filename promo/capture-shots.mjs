// promo/capture-shots.mjs — らっこアプリ紹介動画用に、サイトの実画面を撮る＋アプリ一覧をJSONに落とす
//   ・ヘッドレスChrome(CDP)で rakko-apps-site を 390x844@2x = 780x1688 で描画
// 使い方: node promo/capture-shots.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5351, DBG = 9361;
const ROOT = path.join(os.homedir(), 'apps/rakko-apps-site');
const OUT = path.join(ROOT, 'promo/shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

/* アプリ一覧を動画側が読める形で書き出す */
const { apps, categories } = await import(path.join(ROOT, 'data/apps.js'));
const catLabel = Object.fromEntries(categories.map(c => [c.key, c.label]));
fs.writeFileSync(path.join(ROOT, 'promo/apps.json'), JSON.stringify(
  apps.map(a => ({ folder: a.folder, name: a.name, cat: a.cat, catLabel: catLabel[a.cat] || '', desc: a.desc, featured: !!a.featured })), null, 2));
console.log('apps.json:', apps.length);

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.json':'application/json', '.svg':'image/svg+xml', '.txt':'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, r));

/* iOSのステータスバー風オーバーレイ（実機っぽさ） */
const CHROME_JS = `(function(){
  if(document.getElementById('shot-style')) return 'already';
  var st=document.createElement('style'); st.id='shot-style';
  st.textContent = \`
    #shot-status{position:fixed;left:0;right:0;top:0;height:50px;z-index:99998;pointer-events:none;
      display:flex;align-items:center;padding:0 26px;color:#111;font-weight:700;font-size:16px;
      background:rgba(255,255,255,.92);backdrop-filter:blur(6px);}
    #shot-status .notch{position:absolute;left:50%;transform:translateX(-50%);top:9px;width:118px;height:33px;
      background:#000;border-radius:18px;}
    #shot-status .rt{margin-left:auto;display:flex;align-items:center;gap:7px;}
    #shot-status .bars{display:flex;align-items:flex-end;gap:2px;height:12px;}
    #shot-status .bars i{display:block;width:3px;background:#111;border-radius:1px;}
    #shot-status .bat{width:25px;height:12px;border:2px solid rgba(0,0,0,.7);border-radius:4px;position:relative;}
    #shot-status .bat::after{content:'';position:absolute;left:1.5px;top:1.5px;bottom:1.5px;width:72%;background:#2aa568;border-radius:2px;}
    body{padding-top:50px;}
  \`;
  document.head.appendChild(st);
  var sb=document.createElement('div'); sb.id='shot-status';
  sb.innerHTML='<span>9:41</span><span class="notch"></span>'+
    '<span class="rt"><span class="bars"><i style="height:5px"></i><i style="height:7px"></i><i style="height:9px"></i><i style="height:12px"></i></span>'+
    '<span class="bat"></span></span>';
  document.body.appendChild(sb);
  return 'ok';
})()`;

const SCENES = [
  { name: 'site_top.png',   url: '/',                    scroll: 0 },
  { name: 'site_grid.png',  url: '/',                    scroll: 900 },
  { name: 'site_grid2.png', url: '/',                    scroll: 1700 },
  { name: 'site_app.png',   url: '/apps/pika-tensei/',   scroll: 0 },
];

/* ---------- CDP ---------- */
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars', `--user-data-dir=${OUT}/prof`, `--remote-debugging-port=${DBG}`, 'about:blank'], { stdio: 'ignore' });
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

for (const s of SCENES) {
  const loaded = new Promise(r => loadWaiters.push(r));
  await send('Page.navigate', { url: `http://localhost:${PORT}${s.url}?cb=${Date.now()}` });
  await loaded;
  await sleep(900);
  await evalJS(CHROME_JS);
  await evalJS(`window.scrollTo(0,${s.scroll}); 1`);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, s.name), Buffer.from(shot.result.data, 'base64'));
  console.log(s.name, 'scrollY=', val(await evalJS('window.scrollY')));
}
ws.close(); chrome.kill(); server.close();
console.log('OUT:', OUT);
