// 設定と成績の保存（端末の中だけ）
import { DEFAULT_RULES, DEFAULT_MONEY, normalizeRules, normalizeMoney } from './rules.js';

const KEY = 'bjcount.v1';
const DRILLS = ['count', 'tc', 'bet', 'play', 'mix', 'table'];
const DAYS_KEPT = 60;

export function defaults() {
  return {
    rules: { ...DEFAULT_RULES },
    money: { ...DEFAULT_MONEY },
    strat: 'ix',          // 'bs' 基本戦略だけ / 'ix' カウントで打ち方を変える
    opts: { sound: true, countSpeed: 800, countCards: 20, countGroup: 1, hideTc: false, varyBank: false, bots: 1, dealSpeed: 1, playFocus: 'mix', tableReveal: 'each', tcShowDecks: false, quick: false, bigText: false, tableStart: 'fresh' },
    stats: Object.fromEntries(DRILLS.map(d => [d, { n: 0, ok: 0 }])),
    best: { count: null },   // 数える: 設定ごとの { n, ok }（キーは "枚数|速さ|出し方"）
    daily: null,             // 日ごとの { n, ok }（キーは "YYYY-MM-DD"。60日ぶん）
    tableSave: null,         // 実戦の続き { sig, bank, start, rounds }
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (!Object.hasOwn(saved, k)) continue;
    const b = base[k], s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, s);
    else if (typeof s === typeof b || b === null) out[k] = s;
  }
  return out;
}

const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function load() {
  let s = defaults();
  try {
    const raw = globalThis.localStorage && localStorage.getItem(KEY);
    if (raw) s = merge(s, JSON.parse(raw));
  } catch { /* 保存が読めなくても初期値で動く */ }
  s.rules = normalizeRules(s.rules);
  s.money = normalizeMoney(s.money);
  if (s.strat !== 'bs' && s.strat !== 'ix') s.strat = 'ix';
  if (!isMap(s.best.count)) s.best.count = null;
  if (!isMap(s.daily)) s.daily = null;
  if (!isMap(s.tableSave)) s.tableSave = null;
  return s;
}

export function save(s) {
  try { globalThis.localStorage && localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 容量や設定で保存できないときは諦める */ }
}

// その日の日付（端末の時刻）
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function record(s, drill, ok, n = 1) {
  const st = s.stats[drill];
  if (!st) return;
  st.n += n; st.ok += ok;
  // 日ごとの記録（章ごとの数も。古い日から消す）
  if (!isMap(s.daily)) s.daily = {};
  const k = dayKey(), d = isMap(s.daily[k]) ? s.daily[k] : { n: 0, ok: 0 };
  d.n = (+d.n || 0) + n; d.ok = (+d.ok || 0) + ok;
  if (!isMap(d.by)) d.by = {};
  d.by[drill] = (+d.by[drill] || 0) + n;
  s.daily[k] = d;
  const days = Object.keys(s.daily).sort();
  for (const old of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) delete s.daily[old];
  save(s);
}

// 今日の記録（無ければ null）
export function todayStats(s, now = new Date()) {
  const d = isMap(s.daily) ? s.daily[dayKey(now)] : null;
  return isMap(d) && d.n > 0 ? { n: +d.n || 0, ok: +d.ok || 0 } : null;
}

// 今日、その章を何問やったか
export function todayCount(s, drill, now = new Date()) {
  const d = isMap(s.daily) ? s.daily[dayKey(now)] : null;
  return isMap(d) && isMap(d.by) ? +d.by[drill] || 0 : 0;
}

// 直近 days 日ぶんの記録（古い順。やっていない日は n=0）
export function recentDays(s, days = 14, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const v = isMap(s.daily) ? s.daily[dayKey(dt)] : null;
    out.push({ date: dt, n: isMap(v) ? +v.n || 0 : 0, ok: isMap(v) ? +v.ok || 0 : 0 });
  }
  return out;
}

// 続けた日数のくわしい形: いまの連続・いちばん長い連続・前回やった日（今日を除く）
export function streakInfo(s, now = new Date()) {
  const days = isMap(s.daily) ? Object.keys(s.daily).filter(k => isMap(s.daily[k]) && s.daily[k].n > 0).sort() : [];
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const t = new Date(`${k}T00:00:00`);
    run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  const today = dayKey(now), past = days.filter(k => k < today);
  const last = past.length ? new Date(`${past[past.length - 1]}T00:00:00`) : null;
  const daysAgo = last ? Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - last) / 864e5) : null;
  return { cur: streak(s, now), best, last, daysAgo };
}

// 続けて練習した日数（今日まだなら、昨日までの続き）
export function streak(s, now = new Date()) {
  if (!isMap(s.daily)) return 0;
  const has = (dt) => { const v = s.daily[dayKey(dt)]; return isMap(v) && v.n > 0; };
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!has(cur)) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (n < 400 && has(cur)) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

// 数える: 設定ごとの成績
export function countKey(o) { return `${o.countCards}|${o.countSpeed}|${o.countGroup}`; }
export function recordCount(s, key, ok) {
  if (!isMap(s.best.count)) s.best.count = {};
  const v = isMap(s.best.count[key]) ? s.best.count[key] : { n: 0, ok: 0 };
  v.n = (+v.n || 0) + 1; v.ok = (+v.ok || 0) + (ok ? 1 : 0);
  s.best.count[key] = v;
  save(s);
}
export function countStats(s, key) {
  const v = isMap(s.best.count) ? s.best.count[key] : null;
  return isMap(v) ? { n: +v.n || 0, ok: +v.ok || 0 } : { n: 0, ok: 0 };
}
// 正解できたうちで、1枚あたりの時間がいちばん短い設定
export function fastestCount(s) {
  if (!isMap(s.best.count)) return null;
  let best = null;
  for (const [k, v] of Object.entries(s.best.count)) {
    if (!isMap(v) || !(v.ok > 0)) continue;
    const [cards, speed, group] = k.split('|').map(Number);
    if (!(cards > 0 && speed > 0 && group > 0)) continue;
    const per = speed / group;
    if (!best || per < best.per || (per === best.per && cards > best.cards)) best = { cards, speed, group, per };
  }
  return best;
}
