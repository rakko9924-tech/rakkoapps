/* ゴブレットゴブラーズ 厳密ソルバー（JS移植版・高速化版）
   C++版 gobblers.cpp（予算付きAND-OR証明器）と同一ロジック。
   - 局面: P[0..5] = 9bitマスク（[プレイヤー*3+サイズ], サイズ 0=小,1=中,2=大）, P[6]=手番
   - 値: 手番側視点 +d=dプライで勝ち / -d=dプライで負け / 0=cap内で未決着
   - 高速化: make/unmake・型付き配列メモ・成功手ヒントキャッシュ（C++版のTTヒント相当）
   Web Worker からも Node（テスト）からも使える。 */
(function (global) {
  "use strict";

  const LINES = [7, 56, 448, 73, 146, 292, 273, 84];
  const FULL = 0x1ff;

  const POP = new Uint8Array(512);
  for (let i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);
  const ctz = (x) => 31 - Math.clz32(x & -x);

  // ---- 盤面対称（8変換）テーブル ----
  const PERM = [];
  for (let t = 0; t < 8; t++) {
    const rot = t & 3, fl = t >> 2;
    const p = new Uint8Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let rr = r, cc = fl ? 2 - c : c;
      for (let k = 0; k < rot; k++) { const nr = cc, nc = 2 - rr; rr = nr; cc = nc; }
      p[r * 3 + c] = rr * 3 + cc;
    }
    PERM.push(p);
  }
  const SYMM = [];
  for (let t = 0; t < 8; t++) {
    const tab = new Uint16Array(512);
    for (let m = 0; m < 512; m++) {
      let x = 0;
      for (let i = 0; i < 9; i++) if ((m >> i) & 1) x |= 1 << PERM[t][i];
      tab[m] = x;
    }
    SYMM.push(tab);
  }

  // ---- 現局面（探索中は in-place で更新） ----
  const P = new Int32Array(7);
  function setPos(arr) { for (let i = 0; i < 7; i++) P[i] = arr[i]; }
  function getPos() { return Array.from(P); }

  function visMaskOf(p, who) {
    const o2 = p[2] | p[5], o1 = p[1] | p[4];
    const base = who * 3;
    return (p[base + 2] | (p[base + 1] & ~o2) | (p[base] & ~(o1 | o2))) & FULL;
  }
  function hasLine(v) {
    for (let i = 0; i < 8; i++) if ((v & LINES[i]) === LINES[i]) return true;
    return false;
  }

  // ---- 手の符号化: mv = (from+1)<<8 | lvl<<4 | to（C++版 encMove と同じ） ----
  const mvFrom = (m) => (m >> 8) - 1, mvLvl = (m) => (m >> 4) & 3, mvTo = (m) => m & 15;

  // 深さ毎の手バッファ（GC回避）
  const MVBUF = new Int32Array(64 * 96);
  const SCBUF = new Int32Array(96);
  const ORDS = new Int32Array(64 * 96); // 並べ替え用スコア
  const ORDM = new Int32Array(64 * 96); // 並べ替え用ムーブ

  // P の手番側の合法手を MVBUF[off..] に書き込み、手数を返す
  function genMovesInto(off) {
    const me = P[6], base = me * 3;
    const o0 = P[0] | P[3], o1 = P[1] | P[4], o2 = P[2] | P[5];
    const ab0 = (o0 | o1 | o2) & FULL, ab1 = (o1 | o2) & FULL, ab2 = o2 & FULL;
    let n = 0;
    if (POP[P[base]] < 2) { let d = ~ab0 & FULL; while (d) { const t = ctz(d); d &= d - 1; MVBUF[off + n++] = 0x000 | t; } }
    if (POP[P[base + 1]] < 2) { let d = ~ab1 & FULL; while (d) { const t = ctz(d); d &= d - 1; MVBUF[off + n++] = 0x010 | t; } }
    if (POP[P[base + 2]] < 2) { let d = ~ab2 & FULL; while (d) { const t = ctz(d); d &= d - 1; MVBUF[off + n++] = 0x020 | t; } }
    for (let l = 0; l < 3; l++) {
      const strictAb = l === 0 ? ab1 : l === 1 ? ab2 : 0;
      const abI = l === 0 ? ab0 : l === 1 ? ab1 : ab2;
      let mine = P[base + l] & ~strictAb & FULL;
      while (mine) {
        const f = ctz(mine); mine &= mine - 1;
        let d = ~abI & FULL;
        const head = ((f + 1) << 8) | (l << 4);
        while (d) { const t = ctz(d); d &= d - 1; MVBUF[off + n++] = head | t; }
      }
    }
    return n;
  }

  function make(m) {
    const base = P[6] * 3 + mvLvl(m), f = mvFrom(m);
    if (f >= 0) P[base] &= ~(1 << f);
    P[base] |= 1 << mvTo(m);
    P[6] ^= 1;
  }
  function unmake(m) {
    P[6] ^= 1;
    const base = P[6] * 3 + mvLvl(m), f = mvFrom(m);
    P[base] &= ~(1 << mvTo(m));
    if (f >= 0) P[base] |= 1 << f;
  }

  // make 済みの P について: -1=指した側の負け, +1=勝ち, 0=続行
  function adjudicateP() {
    const mover = P[6] ^ 1;
    if (hasLine(visMaskOf(P, P[6]))) return -1;
    if (hasLine(visMaskOf(P, mover))) return 1;
    return 0;
  }

  // ---- 正規化キー（手番相対 + 8対称の最小） → gHi/gLo ----
  let gHi = 0, gLo = 0;
  function canonP() {
    const a = P[6] * 3, b = (P[6] ^ 1) * 3;
    const pa0 = P[a], pa1 = P[a + 1], pa2 = P[a + 2], pb0 = P[b], pb1 = P[b + 1], pb2 = P[b + 2];
    let bestHi = 0x7fffffff, bestLo = 0x7fffffff;
    for (let t = 0; t < 8; t++) {
      const tab = SYMM[t];
      const hi = (tab[pb1] | (tab[pa2] << 9) | (tab[pb2] << 18)) >>> 0;
      if (hi > bestHi) continue;
      const lo = (tab[pa0] | (tab[pb0] << 9) | (tab[pa1] << 18)) >>> 0;
      if (hi < bestHi || lo < bestLo) { bestHi = hi; bestLo = lo; }
    }
    gHi = bestHi; gLo = bestLo;
  }

  // ---- 証明メモ（開番地法） ----
  const MEMO_BITS = 23; // 8M エントリ ≈ 72MB
  let H, L, MB, MASK, stored;
  function memoInit() {
    H = new Uint32Array(1 << MEMO_BITS);
    L = new Uint32Array(1 << MEMO_BITS);
    MB = new Uint8Array(1 << MEMO_BITS);
    MASK = (1 << MEMO_BITS) - 1;
    stored = 0;
  }
  memoInit();
  function memoGet(hi, lo, meta) {
    let i = ((Math.imul(hi, 0x9e3779b1) ^ Math.imul(lo, 0x85ebca77) ^ Math.imul(meta, 0xc2b2ae3d)) >>> 0) & MASK;
    const h1 = hi + 1;
    while (H[i]) {
      if (H[i] === h1 && L[i] === lo && (MB[i] & 63) === meta) return MB[i] >> 6;
      i = (i + 1) & MASK;
    }
    return 0;
  }
  function memoPut(hi, lo, meta, v) {
    let i = ((Math.imul(hi, 0x9e3779b1) ^ Math.imul(lo, 0x85ebca77) ^ Math.imul(meta, 0xc2b2ae3d)) >>> 0) & MASK;
    const h1 = hi + 1;
    while (H[i]) {
      if (H[i] === h1 && L[i] === lo && (MB[i] & 63) === meta) { MB[i] = meta | (v << 6); return; }
      i = (i + 1) & MASK;
    }
    if (stored > (MASK >> 1) + (MASK >> 2)) return;
    H[i] = h1; L[i] = lo; MB[i] = meta | (v << 6); stored++;
  }

  // ---- 成功手ヒント（直写像キャッシュ。C++版の置換表ヒント相当） ----
  const HINT_BITS = 20; // 1M スロット ≈ 12MB
  const HH = new Uint32Array(1 << HINT_BITS);
  const HL = new Uint32Array(1 << HINT_BITS);
  const HM = new Uint32Array(1 << HINT_BITS); // winHint<<16 | escHint
  const HMASK = (1 << HINT_BITS) - 1;
  const hintIdx = (hi, lo) => ((Math.imul(hi, 0x9e3779b1) ^ Math.imul(lo, 0x85ebca77)) >>> 0) & HMASK;
  function hintGet(hi, lo, which) { // which 0=win, 1=esc
    const i = hintIdx(hi, lo);
    if (HH[i] !== hi + 1 || HL[i] !== lo) return 0;
    return which ? (HM[i] & 0xffff) : (HM[i] >>> 16);
  }
  function hintPut(hi, lo, which, mv) {
    const i = hintIdx(hi, lo);
    if (HH[i] !== hi + 1 || HL[i] !== lo) { HH[i] = hi + 1; HL[i] = lo; HM[i] = 0; }
    HM[i] = which ? ((HM[i] & 0xffff0000) | mv) : ((HM[i] & 0xffff) | (mv << 16));
  }

  // ---- 予算付きAND-OR証明器 ----
  let nodes = 0, nodeLimit = Infinity;
  const ABORT = { abort: true };

  function proveWin(b, depth) {
    if (b <= 0) return false;
    if (++nodes > nodeLimit) throw ABORT;
    canonP();
    const hi = gHi, lo = gLo, meta = b * 2;
    const m0 = memoGet(hi, lo, meta);
    if (m0) return m0 === 2;
    const off = depth * 96;
    const n = genMovesInto(off);
    let ok = false, winMv = -1;
    // 即勝ちチェック
    for (let i = 0; i < n; i++) {
      const m = MVBUF[off + i];
      make(m);
      const a = adjudicateP();
      unmake(m);
      SCBUF[i] = a; // 一時: 判定を再利用（並べ替え前に消費する）
      if (a > 0) { ok = true; winMv = m; break; }
    }
    if (!ok && b >= 2) {
      const oppVis = visMaskOf(P, P[6] ^ 1);
      const hint = hintGet(hi, lo, 0) - 1; // -1 = ヒント無し
      // 並べ替え: ヒント > 相手の見えている駒を被せる > 中央 > 大きい駒
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if (SCBUF[i] !== 0) continue;
        const m = MVBUF[off + i];
        let s = mvLvl(m) << 2;
        if (m === hint) s += 1 << 20;
        if ((oppVis >> mvTo(m)) & 1) s += 64;
        if (mvTo(m) === 4) s += 16;
        let j = cnt;
        while (j > 0 && ORDS[off + j - 1] < s) {
          ORDS[off + j] = ORDS[off + j - 1]; ORDM[off + j] = ORDM[off + j - 1]; j--;
        }
        ORDS[off + j] = s; ORDM[off + j] = m;
        cnt++;
      }
      for (let k = 0; k < cnt && !ok; k++) {
        const m = ORDM[off + k];
        make(m);
        if (proveLoss(b - 1, depth + 1)) { ok = true; winMv = m; }
        unmake(m);
      }
    }
    memoPut(hi, lo, meta, ok ? 2 : 1);
    if (ok && winMv >= 0) hintPut(hi, lo, 0, winMv + 1);
    return ok;
  }

  function proveLoss(b, depth) {
    if (b <= 0) return false;
    if (++nodes > nodeLimit) throw ABORT;
    canonP();
    const hi = gHi, lo = gLo, meta = b * 2 + 1;
    const m0 = memoGet(hi, lo, meta);
    if (m0) return m0 === 2;
    const off = depth * 96;
    const n = genMovesInto(off);
    let ok = true, escMv = -1;
    // 逃げ道ヒントを先に試す（見つかれば即 false で他を探索せずに済む）
    const hint = hintGet(hi, lo, 1) - 1; // -1 = ヒント無し
    for (let pass = 0; pass < 2 && ok; pass++) {
      for (let i = 0; i < n && ok; i++) {
        const m = MVBUF[off + i];
        if (pass === 0 ? m !== hint : m === hint) continue;
        make(m);
        const a = adjudicateP();
        if (a < 0) { unmake(m); continue; }
        if (a > 0) { ok = false; escMv = m; unmake(m); break; }
        if (b < 2 || !proveWin(b - 1, depth + 1)) { ok = false; escMv = m; }
        unmake(m);
      }
    }
    memoPut(hi, lo, meta, ok ? 2 : 1);
    if (!ok && escMv >= 0) hintPut(hi, lo, 1, escMv + 1);
    return ok;
  }

  // 厳密値（P にセット済みの局面）。予算切れは {val:0, resolved:false, provedTo}
  function exactValueP(cap, budget) {
    nodeLimit = budget || Infinity;
    nodes = 0;
    for (let b = 1; b <= cap; b++) {
      try {
        if (proveWin(b, 0)) return { val: b, resolved: true, nodes };
        if (proveLoss(b, 0)) return { val: -b, resolved: true, nodes };
      } catch (e) {
        if (e === ABORT) return { val: 0, resolved: false, provedTo: b - 1, nodes };
        throw e;
      }
    }
    return { val: 0, resolved: false, provedTo: cap, nodes };
  }

  // ---- 公開API（局面は配列 [a0,a1,a2,b0,b1,b2,stm] でやり取り） ----
  function initialPos() { return [0, 0, 0, 0, 0, 0, 0]; }

  function genMoves(pos) {
    setPos(pos);
    const n = genMovesInto(0);
    const out = [];
    for (let i = 0; i < n; i++) out.push(MVBUF[i]);
    return out;
  }
  function applyMove(pos, m) {
    setPos(pos); make(m); return getPos();
  }
  function adjudicate(pos) { // pos = 着手後
    setPos(pos); return adjudicateP();
  }
  function exactValue(pos, cap, budget) {
    setPos(pos);
    return exactValueP(cap, budget);
  }

  const SZ = "SML";
  const cellName = (c) => String.fromCharCode(97 + (c % 3)) + String.fromCharCode(49 + ((c / 3) | 0));
  function moveStr(m) {
    const f = mvFrom(m);
    if (f < 0) return SZ[mvLvl(m)] + cellName(mvTo(m));
    return SZ[mvLvl(m)] + cellName(f) + ">" + cellName(mvTo(m));
  }

  // 全合法手の評価（手番側視点 ±d / 0）。onMove で1手ずつ通知
  function analyze(pos, cap, budgetPerMove, onMove) {
    const mvs = genMoves(pos);
    const res = [];
    for (let i = 0; i < mvs.length; i++) {
      const m = mvs[i];
      setPos(pos); make(m);
      const a = adjudicateP();
      let entry;
      if (a !== 0) entry = { m, str: moveStr(m), val: a, resolved: true };
      else {
        const r = exactValueP(cap, budgetPerMove);
        const v = r.resolved ? (r.val < 0 ? -r.val + 1 : -(r.val + 1)) : 0;
        entry = { m, str: moveStr(m), val: v, resolved: r.resolved, provedTo: r.provedTo };
      }
      res.push(entry);
      if (onMove) onMove(entry, i, mvs.length);
    }
    return res;
  }

  function perft(pos, d) {
    setPos(pos);
    function rec(d, depth) {
      if (d === 0) return 1;
      const off = depth * 96;
      const n = genMovesInto(off);
      let s = 0;
      for (let i = 0; i < n; i++) {
        const m = MVBUF[off + i];
        make(m);
        if (adjudicateP() !== 0) { s += 1; unmake(m); continue; }
        s += rec(d - 1, depth + 1);
        unmake(m);
      }
      return s;
    }
    return rec(d, 0);
  }

  // ---- 2段階評価 ----
  // フェーズ1: 局面値のはしご1本 + 各手への照合プローブで最善手を即確定
  //   （はしご探索でメモが温まっているためプローブはほぼ無料）
  // フェーズ2: 残りの手の厳密値をチャンク実行で順次確定（stepFn を返す）
  function evaluatePosition(pos, cap, budget, post) {
    setPos(pos);
    const pv = exactValueP(cap, budget);
    const mvs = genMoves(pos);
    const out = mvs.map((m) => ({ m, str: moveStr(m), val: 0, resolved: false, optimal: false }));
    // 即時終局の手
    for (const e of out) {
      setPos(pos); make(e.m);
      const a = adjudicateP();
      if (a !== 0) { e.val = a; e.resolved = true; }
    }
    if (pv.resolved) {
      const d = Math.abs(pv.val);
      for (const e of out) {
        if (e.resolved) { e.optimal = (e.val === pv.val); continue; }
        setPos(pos); make(e.m);
        nodeLimit = budget; nodes = 0;
        try {
          if (pv.val > 0) {
            // 勝ち局面: 最短勝ちの子は「ちょうど d-1 で負け」の子だけ（それより速い子は矛盾）
            if (d >= 2 && proveLoss(d - 1, 0)) { e.val = pv.val; e.resolved = true; e.optimal = true; }
          } else {
            // 負け局面: 最長抵抗の子は「相手が ちょうど d-1 で勝ち」の子
            if (d >= 2 && proveWin(d - 1, 0)) {
              nodes = 0;
              const faster = d >= 3 && proveWin(d - 2, 0);
              if (!faster) { e.val = pv.val; e.resolved = true; e.optimal = true; }
              else { e.val = 0; } // 早く負ける手: フェーズ2で厳密化
            }
          }
        } catch (err) { if (err !== ABORT) throw err; }
      }
    }
    post({ type: "phase1", posval: { val: pv.val, resolved: pv.resolved, provedTo: pv.provedTo }, moves: out.map(snap) });
    // フェーズ2: 未確定の手を1手ずつ
    const pending = out.map((e, i) => (e.resolved ? -1 : i)).filter((i) => i >= 0);
    let k = 0;
    return function step() {
      if (k >= pending.length) { post({ type: "done", moves: out.map(snap) }); return false; }
      const e = out[pending[k++]];
      setPos(pos); make(e.m);
      const r = exactValueP(cap, budget);
      if (r.resolved) { e.val = r.val < 0 ? -r.val + 1 : -(r.val + 1); e.resolved = true; }
      else { e.val = 0; e.provedTo = r.provedTo; }
      post({ type: "phase2", moves: [snap(e)] });
      return true;
    };
    function snap(e) { return { m: e.m, str: e.str, val: e.val, resolved: e.resolved, optimal: e.optimal, provedTo: e.provedTo }; }
  }

  const API = {
    initialPos, genMoves, applyMove, adjudicate, exactValue, analyze, perft,
    evaluatePosition, moveStr, cellName, memoInit,
    mvFrom, mvLvl, mvTo,
    visMask: (pos, who) => visMaskOf(pos, who),
    get nodes() { return nodes; },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else global.GobbletSolver = API;

  if (typeof importScripts === "function") {
    let gen = 0;
    self.onmessage = (e) => {
      const { id, type, pos, cap, budget } = e.data;
      if (type !== "evaluate") return;
      const g = ++gen;
      const post = (msg) => { if (gen === g) self.postMessage(Object.assign({ id }, msg)); };
      let step;
      try {
        step = evaluatePosition(pos, cap || 17, budget || 30000000, post);
      } catch (err) {
        self.postMessage({ id, type: "error", message: String(err && err.message || err) });
        return;
      }
      (function loop() {
        if (gen !== g) return; // 新しい依頼が来たら中断
        let more = false;
        try { more = step(); } catch (err) { post({ type: "error", message: String(err && err.message || err) }); return; }
        if (more) setTimeout(loop, 0);
      })();
    };
  }
})(typeof self !== "undefined" ? self : globalThis);
