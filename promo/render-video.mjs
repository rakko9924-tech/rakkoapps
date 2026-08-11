// promo/render-video.mjs — らっこアプリの紹介動画を stage.html から1コマずつ焼く
//   縦(YouTube Shorts): node promo/render-video.mjs
//   横(X/Twitter用):    RATIO=wide node promo/render-video.mjs
//   音だけ差し替え:     MUX_ONLY=1 node promo/render-video.mjs
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5355, DBG = 9365;
const HOME = os.homedir();
const ROOT = path.join(HOME, 'apps/rakko-apps-site');
const DIR = path.join(ROOT, 'promo');
const WIDE = process.env.RATIO === 'wide';
const SUF = WIDE ? '-wide' : '';
const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1920;
const FRAMES = path.join(DIR, 'frames' + SUF);
const OUT = path.join(DIR, 'out');
const FPS = 30;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!process.env.MUX_ONLY) fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

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

let N = 0;
if (process.env.MUX_ONLY) {
  N = fs.readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).length;
  console.log('MUX_ONLY: frames =', N);
} else {
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--force-device-scale-factor=1',
  `--user-data-dir=${DIR}/prof-render`, `--remote-debugging-port=${DBG}`, 'about:blank'], { stdio: 'ignore' });
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
await send('Page.navigate', { url: `http://localhost:${PORT}/promo/stage.html?cb=${Date.now()}${WIDE ? '&ratio=wide' : ''}` });
await loaded;
for (let i = 0; i < 100; i++) { if (val(await evalJS('window.__ready===true'))) break; await sleep(150); }

const total = val(await evalJS('window.__TOTAL'));
N = Math.round(total * FPS);
fs.writeFileSync(path.join(DIR, 'cues' + SUF + '.json'), val(await evalJS('JSON.stringify(window.__CUES)')));
console.log(`${W}x${H}  total ${total.toFixed(2)}s -> ${N} frames`);

if (process.env.SAMPLE) {
  const times = (process.env.SAMPLE_T || '1.6,6.0,11.0,15.0,19.0,23.0,27.0,31.5').split(',').map(Number);
  fs.mkdirSync(path.join(DIR, 'sample'), { recursive: true });
  for (const t of times) {
    await evalJS(`window.__render(${t}); 1`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(DIR, 'sample', `${SUF ? 'w' : 'v'}${t}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  ws.close(); chrome.kill(); server.close();
  console.log('SAMPLE OUT:', path.join(DIR, 'sample'));
  process.exit(0);
}

const t0 = Date.now();
for (let f = 0; f < N; f++) {
  await evalJS(`window.__render(${(f / FPS).toFixed(5)}); 1`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94, captureBeyondViewport: false });
  fs.writeFileSync(path.join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
  if (f % 60 === 0) console.log(`  ${f}/${N}  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
ws.close(); chrome.kill(); server.close();
}

/* ---------- 音（BGM: 魔王魂 / SE: Kenney CC0） ---------- */
const BGM = path.join(HOME, 'AppAssets/audio/bgm/maou_game_casino02.m4a');
const SE_POP = path.join(HOME, 'AppAssets/audio/se/kenney_interface-sounds/click_002.m4a');
const SE_SW  = path.join(HOME, 'AppAssets/audio/se/kenney_interface-sounds/switch_004.m4a');
const SE_OK  = path.join(HOME, 'AppAssets/audio/se/kenney_interface-sounds/confirmation_001.m4a');

const cues = JSON.parse(fs.readFileSync(path.join(DIR, 'cues' + SUF + '.json'), 'utf8'));
const inputs = ['-i', BGM];
const filters = [];
let idx = 2;                     // 0=無音mp4 / 1=BGM / 2以降=SE
const mixLabels = [];
filters.push(`[1:a]atrim=0:${(N/FPS).toFixed(2)},volume=0.26,afade=t=in:st=0:d=1.2,afade=t=out:st=${(N/FPS-1.6).toFixed(2)}:d=1.6[bgm]`);
mixLabels.push('[bgm]');
const addSE = (file, times, vol) => {
  for (const t of times) {
    inputs.push('-i', file);
    filters.push(`[${idx}:a]volume=${vol},adelay=${Math.round(t*1000)}|${Math.round(t*1000)}[s${idx}]`);
    mixLabels.push(`[s${idx}]`); idx++;
  }
};
addSE(SE_POP, cues.pops || [], 0.34);
addSE(SE_SW, cues.switches || [], 0.3);
addSE(SE_OK, cues.cta == null ? [] : [cues.cta], 0.5);
filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

const silent = path.join(OUT, `rakko-intro${SUF}-silent.mp4`);
const final  = path.join(OUT, `rakko-intro${SUF}.mp4`);

console.log('encoding video...');
execFileSync('ffmpeg', ['-y','-framerate',String(FPS),'-i',path.join(FRAMES,'f%05d.jpg'),
  '-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart', silent], { stdio: 'inherit' });

console.log('muxing audio...');
execFileSync('ffmpeg', ['-y','-i',silent, ...inputs, '-filter_complex', filters.join(';'),
  '-map','0:v','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart', final], { stdio: 'inherit' });

try { server.close(); } catch {}
console.log('DONE:', final);
process.exit(0);
