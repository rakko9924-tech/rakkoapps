// 問題の作り方（画面に依存しない。乱数 rng を渡せば再現できる）
import { randInt, pick, Shoe, cardValue, tagOf, trueCountByDecks } from './cards.js';
import { handInfo, decide, devRows, baseAction } from './strategy.js';
import { betFor, betRaw } from './betting.js';

const SUITN = 4;
// 値（A=1, 10=絵札含む）から札番号を1枚つくる
export function cardOfValue(rng, v) {
  const rank = v === 10 ? 9 + randInt(rng, 4) : v - 1;
  return rank + 13 * randInt(rng, SUITN);
}

// ---- 第1章 数える ----
// groups: 1回に見せる札の束（1枚ずつ／2枚ずつ…）。answer: 最後のランニングカウント
export function countQuestion(rng, { decks = 6, cards = 20, group = 1, start = 0 }) {
  const shoe = new Shoe(decks, 90, rng);
  const ids = [];
  for (let i = 0; i < cards; i++) ids.push(shoe.draw());
  const groups = [];
  for (let i = 0; i < ids.length; i += group) groups.push(ids.slice(i, i + group));
  let rc = start;
  const running = ids.map((id) => (rc += tagOf(id)));
  return { ids, groups, start, answer: rc, running };
}

// ---- 第2章 割る ----
// 残りデッキは半デッキ刻み（1デッキの卓は 1/4 刻み）で読む
export function deckSteps(decks) { return decks === 1 ? 4 : 2; }
// 残りデッキを1つ選ぶ。pen（どこまで配るか・%）を渡すと、カットカードより先（実際には配られない深さ）は出さない
export function pickDecksLeft(rng, decks, pen = 100) {
  const sp = deckSteps(decks), total = decks * sp;
  const minRem = Math.min(total - 1, Math.max(1, Math.ceil(decks * (1 - pen / 100) * sp - 1e-9)));
  return (minRem + randInt(rng, total - minRem)) / sp;   // minRem 〜（全部−1刻み）
}
// 正規分布の乱数（Box–Muller）
function gauss(rng) { let u = 0; while (u <= 1e-12) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }

// 配り終えた札のランニングカウントの散らばり（標準偏差）。Hi-Lo は1枚あたりの分散が 10/13、
// 山から戻さずに引くので (N−n)/(N−1) を掛ける。1デッキしか配っていないのに +30 のような、卓で起きない数を出さないため
export function rcSpread(decks, decksLeft) {
  const N = 52 * decks, n = N - 52 * decksLeft;
  return Math.sqrt(Math.max(1, ((n * (N - n)) / Math.max(1, N - 1)) * (10 / 13)));
}

export function tcQuestion(rng, { decks = 6, pen = 100, prev = null } = {}) {
  const decksLeft = pickDecksLeft(rng, decks, pen);
  const sd = rcSpread(decks, decksLeft) * 1.25;        // 実際の散らばりより少しだけ広く（練習のため）
  let rc = 0, guard = 0;
  do rc = Math.round(gauss(rng) * sd) || 0;
  while ((rc === 0 || Math.abs(rc / decksLeft) > 12 || (prev && rc === prev.rc && decksLeft === prev.decksLeft)) && ++guard < 60);
  if (rc === 0 || Math.abs(rc / decksLeft) > 12) rc = rng() < 0.5 ? 1 : -1;
  return { decks, decksLeft, decksDealt: decks - decksLeft, rc, answer: trueCountByDecks(rc, decksLeft) };
}

// ---- 第3章 賭ける ----
// 出題するカウントの範囲: 実際に出るもの（出現率が小さすぎないもの）
// 既定は「2,000ハンドに1回以上」出るカウントまで
export function reachableTcs(rows, minFreq = 5e-4) {
  const ok = rows.filter(r => r.f >= minFreq).map(r => r.tc);
  return { lo: Math.max(-4, ok[0]), hi: ok[ok.length - 1] };
}
// プラスのカウントを、出やすさの平方根に比例して選ぶ（よく出る +1〜+4 を多めに、高いカウントも練習できる程度に）
export function pickPositiveTc(rng, rows, hi) {
  const pool = rows.filter(r => r.tc >= 1 && r.tc <= hi);
  if (!pool.length) return Math.max(1, hi);
  const w = pool.map(r => Math.sqrt(Math.max(r.f, 1e-7)));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i].tc; }
  return pool[pool.length - 1].tc;
}
const BANK_FACTORS = [0.5, 0.75, 1, 1, 1.5, 2, 3, 5, 10];

// floor(rc ÷ decksLeft) がちょうど tc になるランニングカウントをつくる
// （残りが1デッキ未満だと、ぴったりの数が無いカウントもある。そのときは一番近い数を返す）
export function rcForTc(rng, tc, decksLeft) {
  const lo = Math.ceil(tc * decksLeft - 1e-9), hi = Math.ceil((tc + 1) * decksLeft - 1e-9) - 1;
  return (hi >= lo ? lo + randInt(rng, hi - lo + 1) : lo) || 0; // −0 を 0 に
}

// 賭け金表の「段」（同じ賭け金が続くカウントのまとまり）から1つ選び、その中のカウントを選ぶ。
// 最低ベットの段は4回に1回ほど、それ以外の段は同じくらいの回数で出す（同じ答えばかり続かないように）
export function pickBetTc(rng, rows, money, bank, lo, hi) {
  const levels = [];
  for (const r of rows) {
    if (r.tc < lo || r.tc > hi) continue;
    const bet = betFor(bank, r, money), L = levels[levels.length - 1];
    if (L && L.bet === bet) L.rows.push(r); else levels.push({ bet, rows: [r] });
  }
  if (!levels.length) return Math.max(lo, Math.min(hi, 1));
  const minL = levels[0].bet === money.min ? levels[0] : null;
  const others = minL ? levels.slice(1) : levels;
  const L = !others.length || (minL && rng() < 0.25) ? (minL || levels[0]) : others[randInt(rng, others.length)];
  // 段の中は、出やすさの平方根に比例して選ぶ
  const w = L.rows.map(r => Math.sqrt(Math.max(r.f, 1e-7)));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < L.rows.length; i++) { x -= w[i]; if (x <= 0) return L.rows[i].tc; }
  return L.rows[L.rows.length - 1].tc;
}

export function betQuestion(rng, { rows, money, decks = 6, pen = 100, varyBank = false, hideTc = false, tc: forceTc, prev = null }) {
  const { lo, hi } = reachableTcs(rows);
  const bank = varyBank ? Math.round(money.bank * pick(rng, BANK_FACTORS) / money.step) * money.step : money.bank;
  let tc = forceTc;
  if (tc === undefined) {
    // 前の問題と同じカウント・同じ答えが続かないように、何度か引き直す
    for (let k = 0; k < 8; k++) {
      tc = pickBetTc(rng, rows, money, bank, lo, hi);
      if (!prev) break;
      const sameQ = tc === prev.tc && bank === prev.bank;
      const sameA = betFor(bank, rows.find(r => r.tc === tc), money) === prev.answer;
      if (!sameQ && !(sameA && rng() < 0.6)) break;
    }
  }
  const row = rows.find(r => r.tc === tc);
  const q = { bank, tc, row, raw: betRaw(bank, row, money), answer: betFor(bank, row, money) };
  if (hideTc) {
    q.decksLeft = pickDecksLeft(rng, decks, pen);
    q.rc = rcForTc(rng, tc, q.decksLeft);
    q.tc = trueCountByDecks(q.rc, q.decksLeft);
    q.row = rows.find(r => r.tc === Math.max(rows[0].tc, Math.min(rows[rows.length - 1].tc, q.tc)));
    q.raw = betRaw(bank, q.row, money);
    q.answer = betFor(bank, q.row, money);
  }
  return q;
}

// ---- 第4章 打つ ----
const HARD2 = { // 2枚でつくるハードの合計（ペアは除く）
  5: [[2, 3]], 6: [[2, 4]], 7: [[2, 5], [3, 4]], 8: [[2, 6], [3, 5]], 9: [[2, 7], [3, 6], [4, 5]], 10: [[2, 8], [3, 7], [4, 6]],
  11: [[2, 9], [3, 8], [4, 7], [5, 6]], 12: [[2, 10], [3, 9], [4, 8], [5, 7]], 13: [[3, 10], [4, 9], [5, 8], [6, 7]],
  14: [[4, 10], [5, 9], [6, 8]], 15: [[5, 10], [6, 9], [7, 8]], 16: [[6, 10], [7, 9]], 17: [[7, 10], [8, 9]], 18: [[8, 10]], 19: [[9, 10]],
};
const HARD3 = { 12: [[2, 3, 7], [4, 5, 3], [2, 4, 6]], 13: [[2, 4, 7], [3, 5, 5], [6, 4, 3]], 15: [[3, 4, 8], [5, 4, 6], [2, 6, 7]], 16: [[4, 5, 7], [3, 6, 7], [2, 4, 10], [5, 3, 8]] };

function handFor(rng, kind, total, allow3) {
  if (kind === 'P') return [total, total];
  if (kind === 'S') return [1, total - 11];
  if (allow3 && HARD3[total] && rng() < 0.3) return pick(rng, HARD3[total]).slice();
  const c = pick(rng, HARD2[total]);
  return rng() < 0.5 ? c.slice() : c.slice().reverse();
}

// focus: 'dev'（カウントで変わる場面）, 'basic'（基本戦略）, 'ins'（保険）, 'mix'（まぜる）
export function playQuestion(rng, { chart, devs, ins = 99, rules, useIdx = true, focus = 'mix', tc: forceTc }) {
  const rows = useIdx ? devRows(devs) : null;
  let mode = focus;
  if (mode === 'mix') { const x = rng(); mode = useIdx && devs.length ? (x < 0.55 ? 'dev' : x < 0.9 ? 'basic' : 'ins') : 'basic'; }
  if (mode === 'ins' && !(useIdx && ins < 50)) mode = 'basic';
  if (mode === 'dev' && !(useIdx && devs.length)) mode = 'basic';

  if (mode === 'ins') {
    const tc = forceTc !== undefined ? forceTc : ins + pick(rng, [-3, -2, -1, -1, 0, 0, 1, 2, 3]);
    const vals = handFor(rng, 'H', pick(rng, [12, 13, 14, 15, 16, 17, 18, 19]), false);
    return { type: 'ins', vals, cards: vals.map(v => cardOfValue(rng, v)), up: 1, upCard: cardOfValue(rng, 1), tc, answer: tc >= ins ? 'Y' : 'N', ins };
  }

  let vals, up, tc;
  if (mode === 'dev') {
    const d = pick(rng, devs);
    const hs = d.hi === 'S' || d.hi === 'H';
    vals = handFor(rng, d.kind, d.total, hs);
    up = d.up;
    tc = forceTc !== undefined ? forceTc : d.idx + pick(rng, [-3, -2, -1, -1, 0, 0, 1, 2]);
  } else {
    const x = rng();
    if (x < 0.5) vals = handFor(rng, 'H', 8 + randInt(rng, 10), false);          // ハード 8〜17
    else if (x < 0.75) vals = handFor(rng, 'S', 13 + randInt(rng, 7), false);    // ソフト 13〜19
    else vals = handFor(rng, 'P', 1 + randInt(rng, 10), false);                   // ペア
    up = 1 + randInt(rng, 10);
    tc = forceTc !== undefined ? forceTc : pick(rng, [-2, -1, 0, 0, 0, 1, 2]);
  }
  const info = handInfo(vals);
  const can = { D: vals.length === 2, P: info.pairVal > 0, R: !!(rules.ls && rules.peek) && vals.length === 2 };
  const r = rows ? decide(chart, rows, info, up, tc, can) : { act: baseAction(chart, info, up, can), base: baseAction(chart, info, up, can), used: null };
  return { type: 'play', vals, cards: vals.map(v => cardOfValue(rng, v)), up, upCard: cardOfValue(rng, up), tc, info, can, answer: r.act, base: r.base, used: r.used, mode };
}

// ---- 第5章 総合 ----
// 「資金・カウント・最低〜最大ベットはこれ。いくら賭ける？ → 配られた。どう打つ？」
export function mixQuestion(rng, { rows, money, chart, devs, ins, rules, useIdx, decks = 6, pen = 100, varyBank = false }) {
  const decksLeft = pickDecksLeft(rng, decks, pen);
  const { lo, hi } = reachableTcs(rows);
  // 打つ場面を先に決める（その時点のカウント tc1）。配られた3枚の分を引いて、賭ける時点のカウントを出す
  const p = playQuestion(rng, { chart, devs, ins, rules, useIdx, focus: rng() < 0.5 ? 'dev' : 'basic' });
  let tc1 = Math.max(lo, Math.min(hi, p.type === 'play' && p.mode === 'dev' ? p.tc : (rng() < 0.3 ? lo + randInt(rng, Math.max(1, 1 - lo)) : pickPositiveTc(rng, rows, hi))));
  const rc1 = rcForTc(rng, tc1, decksLeft);
  tc1 = trueCountByDecks(rc1, decksLeft);
  const shown = [...p.cards, p.upCard];
  const rc0 = rc1 - shown.reduce((a, id) => a + tagOf(id), 0);
  const tc0 = trueCountByDecks(rc0, decksLeft);
  const bank = varyBank ? Math.round(money.bank * pick(rng, BANK_FACTORS) / money.step) * money.step : money.bank;
  const clampTc = (t) => Math.max(rows[0].tc, Math.min(rows[rows.length - 1].tc, t));
  const row = rows.find(r => r.tc === clampTc(tc0));
  // 打ち方は、配られたあとのカウント tc1 で決め直す
  const info = handInfo(p.vals);
  const can = { D: true, P: info.pairVal > 0, R: !!(rules.ls && rules.peek) };
  const r = useIdx ? decide(chart, devRows(devs), info, p.up, tc1, can) : { act: baseAction(chart, info, p.up, can), base: baseAction(chart, info, p.up, can), used: null };
  return {
    bank, decksLeft, rc0, tc0, rc1, tc1, row, raw: betRaw(bank, row, money), bet: betFor(bank, row, money),
    vals: p.vals, cards: p.cards, up: p.up, upCard: p.upCard, info, can, answer: r.act, base: r.base, used: r.used,
  };
}
