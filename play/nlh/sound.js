/* sound.js — 効果音（フリー素材の音声ファイルを再生）
   音源は Kenney（kenney.nl）の CC0 / パブリックドメイン素材。`sfx/*.m4a`。
   元ファイルとの対応は SFX-CREDITS.md を参照。
   window.SFX.play('名前') で再生。iOS は最初のユーザー操作まで音を出せないため、
   最初のタッチ/クリックで AudioContext を resume する。 */
(function () {
  const NAMES = ['click', 'flip', 'deal', 'check', 'chip', 'chips', 'allin', 'fold', 'win', 'lose'];
  // 素材ごとの音量差をここで揃える（1.0 = そのまま）。
  const GAIN = { click: 0.5, flip: 0.7, deal: 0.7, check: 0.9, chip: 0.8, chips: 0.7, allin: 0.8, fold: 0.7, win: 0.7, lose: 0.7 };
  const SRC = (name) => `./sfx/${name}.m4a`;

  let ctx = null;
  let master = null;
  let enabled = true; // game.js 側の設定で上書きされる
  const buffers = {}; // name -> AudioBuffer
  let loading = false;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  // 全SFXを一度だけ取得してデコードしておく（初回再生の取りこぼしを減らす）。
  function loadAll() {
    const c = ensureCtx();
    if (!c || loading) return;
    loading = true;
    NAMES.forEach((name) => {
      fetch(SRC(name))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((ab) => new Promise((res, rej) => {
          // Safari の古い実装はコールバック形式のみ対応。
          const p = c.decodeAudioData(ab, res, rej);
          if (p && p.then) p.then(res, rej);
        }))
        .then((buf) => { buffers[name] = buf; })
        .catch(() => { /* 1つ落ちても他の音は鳴らす */ });
    });
  }

  // 最初のユーザー操作で AudioContext を起動（iOS対策）＋読み込み開始。
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    loadAll();
  }
  ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true })
  );

  window.SFX = {
    setEnabled(v) { enabled = !!v; },
    // 事前読み込み。AudioContext が起動できる状況でのみ効く。
    preload() { loadAll(); },
    play(name) {
      if (!enabled) return;
      const c = ensureCtx();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      loadAll();
      const buf = buffers[name];
      if (!buf) return; // まだデコード中なら無音（次回以降は鳴る）
      try {
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.value = GAIN[name] != null ? GAIN[name] : 0.8;
        src.connect(g).connect(master);
        src.start();
      } catch (e) { /* 失敗しても無視 */ }
    },
  };
})();
