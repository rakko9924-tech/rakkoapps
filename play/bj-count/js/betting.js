// 賭け金と破産リスクの計算
//
// 1) ケリー基準
//   あるカウントでの優位（1単位あたりの期待値）を e、結果の二乗平均を m とすると、
//   資金を最も速く増やす賭け金は  資金 × e ÷ m。これに「ケリーの何倍で打つか」k を掛ける。
//
// 2) 賭けないという選択肢は無い（優位がマイナスでも最低ベットは置く）
//   そのぶん資金は少しずつ削られる。資金が少ないあいだは、ケリー額どおりに小さく賭けると
//   削られる分を取り返せず、ほぼ確実に破産する。
//   破産確率を最も小さくするのは「期待値 ÷ 分散」を最大にする賭け方で、
//   形はケリーと同じ（優位 ÷ 二乗平均 に比例）、大きさだけが「資金 B* ぶん」に固定される（ruinFloor）。
//
// 3) 正解の賭け金
//   max(k × 資金, B*) × e ÷ m を、最低〜最大ベットに収めて刻みに丸める。
//   資金が十分あればケリーどおり、足りないあいだは破産リスクが最小になる賭け方、ということ。
//
// 破産リスク
//   資金 x のときの1ハンドあたりの期待値 μ(x) と分散 σ²(x) は、上の賭け方から決まる。
//   「資金が最低ベット未満になる＝破産」として、拡散近似で破産確率 u(x) を解く:
//     u(x) = ∫x→∞ s(y)dy ÷ ∫x0→∞ s(y)dy,   s(y) = exp(−∫ 2μ/σ² )

export function decodeTable(json, strat, pen, bj65) {
  const src = strat === 'ix' && json.ix ? json.ix[pen] : json.bs[pen];
  if (!src) throw new Error(`no table for pen ${pen}`);
  const rows = [];
  for (let i = 0; i < src.f.length; i++) {
    const nat = src.n[i] / 1e5;
    let e = src.e[i] / 1e6, m = src.m[i] / 1e4;
    if (bj65) { e -= 0.3 * nat; m -= 0.81 * nat; } // BJ配当 6:5（1.5倍→1.2倍）
    rows.push({ tc: json.tcMin + i, f: src.f[i] / 1e8, e, m, nat, fit: src.x[i] });
  }
  let flatE = 0, flatM = 0;
  for (const r of rows) { flatE += r.f * r.e; flatM += r.f * r.m; }
  rows.flatE = flatE; rows.flatM = flatM;
  return rows;
}

// 資金に比例するケリー額（k 倍）
export function kellyRaw(bank, row, k) {
  return row.e > 0 ? (k * bank * row.e) / row.m : 0;
}

// 破産確率を最小にする賭け方の「基準の資金」B*。
//   各カウントの賭け金を b_i = clamp(B × e_i ÷ m_i) としたとき、期待値 N ÷ 分散 が最大になる B。
//   最大の条件から B = (Q + N²) ÷ (2N)（Q = 賭け金²×二乗平均の平均）。これを繰り返して求める。
//   最大ベットまで賭けても期待値がマイナスなら、どう賭けても破産する（hopeless）。
export function ruinFloor(rows, money) {
  const { min, max } = money;
  const stat = (B) => {
    let N = 0, Q = 0;
    for (const r of rows) { const b = Math.min(max, Math.max(min, r.e > 0 ? (B * r.e) / r.m : 0)); N += r.f * b * r.e; Q += r.f * b * b * r.m; }
    return { N, Q };
  };
  if (stat(Infinity).N <= 0) return { base: Infinity, hopeless: true, ratio: 0 };
  let B = 100 * min;
  for (let i = 0; i < 300; i++) {
    const t = stat(B);
    if (t.N <= 0) { B *= 2; continue; }
    const nb = (t.Q + t.N * t.N) / (2 * t.N);
    if (Math.abs(nb - B) <= 1e-9 * B) { B = nb; break; }
    B = nb;
  }
  const t = stat(B);
  return { base: B, hopeless: false, ratio: t.N / (t.Q - t.N * t.N) };
}

// お金の条件に、その卓の B* を付ける（賭け金の計算はこれを使う）
export function withBase(rows, money) {
  const f = ruinFloor(rows, money);
  return { ...money, base: f.base, hopeless: f.hopeless };
}

// 賭け金の元になる額: 資金が足りないあいだは B* ぶん、十分あればケリー（k×資金）ぶん
export function betRaw(bank, row, money) {
  if (!(row.e > 0)) return 0;
  return (Math.max(money.kelly * bank, money.base || 0) * row.e) / row.m;
}

// 最低ベットから刻みごとの格子に丸める（ちょうど中間は小さい方へ）
export function snapBet(x, money) {
  if (x <= money.min) return money.min;
  if (x >= money.max) return money.max;
  let b = money.min + Math.floor((x - money.min) / money.step + 0.5 - 1e-9) * money.step;
  if (b > money.max) b = money.max;
  return b;
}

export function betFor(bank, row, money) {
  let b = snapBet(betRaw(bank, row, money), money);
  if (b > bank) b = Math.max(money.min, money.min + Math.floor((bank - money.min) / money.step) * money.step);
  return b;
}

// カウントごとの賭け金表。mult を渡すと、そのカウントの賭け金を倍率で動かす（答え合わせの「もしこう賭け続けたら」用）
export function ramp(bank, rows, money, mult) {
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const raw = betRaw(bank, r, money);
    let bet = betFor(bank, r, money);
    if (mult && mult[r.tc] !== undefined) bet = Math.min(money.max, Math.max(money.min, bet * mult[r.tc]));
    out[i] = { tc: r.tc, f: r.f, e: r.e, m: r.m, raw, bet };
  }
  return out;
}

// 1ハンドあたりの期待値・分散など
export function metrics(rp) {
  let mu = 0, m2 = 0, avg = 0;
  for (const r of rp) { mu += r.f * r.bet * r.e; m2 += r.f * r.bet * r.bet * r.m; avg += r.f * r.bet; }
  const v = Math.max(m2 - mu * mu, 1e-12);
  return { mu, var: v, sd: Math.sqrt(v), avgBet: avg, n0: mu > 0 ? v / (mu * mu) : Infinity };
}

// 破産リスクの模型。返り値の関数で、任意の資金からの破産確率などを引ける
export function ruinModel(rows, money, opts = {}) {
  const x0 = money.min;
  const GRID = opts.grid || 1600;
  const span = opts.span || 1e8;
  const lr = Math.log(span) / (GRID - 1);
  const xs = new Float64Array(GRID), phi = new Float64Array(GRID);
  for (let i = 0; i < GRID; i++) {
    xs[i] = x0 * Math.exp(lr * i);
    const mt = metrics(ramp(xs[i], rows, money, opts.mult));
    phi[i] = (2 * mt.mu) / mt.var;
  }
  const Phi = new Float64Array(GRID);
  let pmin = 0;
  for (let i = 1; i < GRID; i++) { Phi[i] = Phi[i - 1] + 0.5 * (phi[i] + phi[i - 1]) * (xs[i] - xs[i - 1]); if (Phi[i] < pmin) pmin = Phi[i]; }
  const s = new Float64Array(GRID), I = new Float64Array(GRID);
  for (let i = 0; i < GRID; i++) s[i] = Math.exp(-(Phi[i] - pmin));
  for (let i = 1; i < GRID; i++) I[i] = I[i - 1] + 0.5 * (s[i] + s[i - 1]) * (xs[i] - xs[i - 1]);
  // 格子より先のぶん
  const pe = phi[GRID - 1], xe = xs[GRID - 1];
  let tail;
  if (!(pe > 0)) tail = Infinity; // どれだけ資金があっても期待値がプラスにならない
  else {
    const j = Math.max(0, GRID - 1 - Math.round(Math.log(2) / lr));
    const ratio = phi[j] / pe; // ≈1: 上限で頭打ち（指数で減る） ／ ≈2: 資金に比例して賭ける（べき乗で減る）
    if (ratio < 1.3) tail = s[GRID - 1] / pe;
    else { const c = pe * xe; tail = c > 1.02 ? (s[GRID - 1] * xe) / (c - 1) : Infinity; }
  }
  const total = I[GRID - 1] + tail;
  const at = (x) => { // I(x) を補間
    if (x <= x0) return 0;
    if (x >= xe) return I[GRID - 1];
    const p = Math.log(x / x0) / lr, i = Math.floor(p), t = p - i;
    // 区間内は s を直線とみなして積分
    const xa = xs[i], sa = s[i], sb = s[i + 1], xb = xs[i + 1];
    const sx = sa + (sb - sa) * ((x - xa) / (xb - xa));
    return I[i] + 0.5 * (sa + sx) * (x - xa) + 0 * t;
  };
  return {
    x0, xs, phi,
    hopeless: !Number.isFinite(total),
    // 資金 b から打ち続けたときに、いつか破産する確率
    ruinAt(b) {
      if (b < x0) return 1;
      if (!Number.isFinite(total)) return 1;
      return Math.min(1, Math.max(0, (total - at(b)) / total));
    },
    // 破産する前に target に届く確率
    reachBefore(b, target) {
      if (b < x0) return 0;
      if (b >= target) return 1;
      const d = at(target);
      return d > 0 ? Math.min(1, at(b) / d) : 0;
    },
    // 破産確率が r 以下になる最小の資金（見つからなければ null）
    bankFor(r) {
      if (!Number.isFinite(total)) return null;
      let lo = 0, hi = GRID - 1;
      if ((total - I[hi]) / total > r) return null;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((total - I[mid]) / total > r) lo = mid; else hi = mid; }
      // 区間内を二分法で詰める
      let a = xs[lo], b = xs[hi];
      for (let k = 0; k < 30; k++) { const mid = 0.5 * (a + b); if ((total - at(mid)) / total > r) a = mid; else b = mid; }
      return b;
    },
  };
}

// 賭け金を固定したまま（資金が増減しても賭け方を変えない）ときの破産確率
export function fixedRuin(mt, bank, x0) {
  if (!(mt.mu > 0)) return 1;
  return Math.min(1, Math.exp((-2 * mt.mu * (bank - x0)) / mt.var));
}

// 資金の推移を乱数で試す。各ハンドは「カウントを出現率で引く → ±√m の結果を期待値が合う確率で引く」。
// 平均と分散がシミュレータの値と一致する簡略モデル（資金の動きを見るには十分）。
export function simulatePaths(rows, money, { bank, rounds, paths, rng, keep = 40, points = 80, target = Infinity, stopAtTarget = false }) {
  const stepOut = Math.max(1, Math.floor(rounds / points));
  const kept = [];
  const finals = new Float64Array(paths);
  let ruined = 0, hitTarget = 0, ruinRoundSum = 0;
  const NB = rows.length;
  const cum = new Float64Array(NB * 2), val = new Float64Array(NB * 2);
  let rampBank = -1, tol = 0;
  const build = (b) => {
    const rp = ramp(b, rows, money);
    let acc = 0, emax = 0;
    for (let i = 0; i < NB; i++) {
      const r = rp[i], a = Math.sqrt(r.m), pw = 0.5 * (1 + r.e / a);
      acc += r.f * pw; cum[2 * i] = acc; val[2 * i] = r.bet * a;
      acc += r.f * (1 - pw); cum[2 * i + 1] = acc; val[2 * i + 1] = -r.bet * a;
      if (r.e > emax && r.f > 0) emax = r.e;
    }
    for (let i = 0; i < 2 * NB; i++) cum[i] /= acc;
    rampBank = b;
    // 賭け金が半刻み動くほど資金が変わったら作り直す
    tol = emax > 0 ? (money.step * 1.3) / (money.kelly * emax) / 4 : Infinity;
  };
  for (let p = 0; p < paths; p++) {
    let b = bank, dead = false, reached = false;
    const line = p < keep ? [b] : null;
    for (let n = 1; n <= rounds; n++) {
      if (Math.abs(b - rampBank) > tol) build(b);
      const u = rng();
      // 二分探索
      let lo = 0, hi = 2 * NB - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
      b += val[lo];
      if (b < money.min) { dead = true; ruinRoundSum += n; b = Math.max(b, 0); if (line) { while (line.length <= points) line.push(0); } break; }
      if (b >= target) { reached = true; if (stopAtTarget) break; }
      if (line && n % stepOut === 0) line.push(b);
    }
    if (dead) ruined++;
    if (reached) hitTarget++;
    finals[p] = dead ? 0 : b;
    if (line) kept.push({ pts: line, dead });
  }
  const sorted = Float64Array.from(finals).sort();
  const q = (x) => sorted[Math.min(paths - 1, Math.floor(x * paths))];
  let mean = 0; for (let i = 0; i < paths; i++) mean += finals[i]; mean /= paths;
  return { paths: kept, finals, ruined, ruin: ruined / paths, target: hitTarget / paths, mean, p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), avgRuinRound: ruined ? ruinRoundSum / ruined : null, stepOut };
}

// 賭け金の答え合わせ
//   ok: 正解と同じ / near: 1刻みずれ / over: 賭けすぎ / under: 賭けなさすぎ
export function gradeBet(user, opt, money) {
  if (user === opt) return 'ok';
  if (Math.abs(user - opt) <= money.step + 1e-9) return 'near';
  return user > opt ? 'over' : 'under';
}

export const fmt = (x) => Math.round(x).toLocaleString('ja-JP');
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export function pctSmart(x) {
  if (x >= 0.9995) return '100%';
  if (x >= 0.1) return `${(x * 100).toFixed(0)}%`;
  if (x >= 0.01) return `${(x * 100).toFixed(1)}%`;
  if (x >= 0.0001) return `${(x * 100).toFixed(2)}%`;
  return '0.01%未満';
}
