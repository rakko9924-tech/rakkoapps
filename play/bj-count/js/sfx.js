// 効果音（フリー素材の音声ファイルを鳴らす。出典は SFX-CREDITS.md）
// 音声ファイルを一度だけ読み込んでおき、必要なときに鳴らす。
// iPhone は最初の操作まで音を出せないので、最初のタッチで再生の準備をする。
const NAMES = ['tick', 'deal', 'ok', 'ng', 'chip', 'click'];
const GAIN = { tick: 0.5, deal: 0.6, ok: 0.55, ng: 0.5, chip: 0.6, click: 0.45 };

let ctx = null, master = null, loading = false, enabled = true;
const buffers = {};

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

function loadAll() {
  const c = ensureCtx();
  if (!c || loading) return;
  loading = true;
  for (const name of NAMES) {
    fetch(`./sfx/${name}.m4a`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .then((buf) => { buffers[name] = buf; })
      .catch(() => { /* 1つ読めなくても、ほかの音は鳴らす */ });
  }
}

// 最初の操作で準備する（音を切っている人には読み込みもしない）
function unlock() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  loadAll();
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
}

export function setEnabled(v) { enabled = !!v; }
export function isEnabled() { return enabled; }
export function play(name) {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  loadAll();
  const buf = buffers[name];
  if (!buf) return; // まだ読み込み中なら鳴らさない（次からは鳴る）
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = GAIN[name] ?? 0.5;
    src.connect(g).connect(master);
    src.start();
  } catch { /* 音が出せなくても練習は続けられる */ }
}
