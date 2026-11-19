// 卓のルールと資金の条件

export const DEFAULT_RULES = { decks: 6, h17: false, das: true, ls: false, peek: true, bj65: false, pen: 75 };
export const DEFAULT_MONEY = { bank: 100000, min: 1000, max: 10000, step: 500, kelly: 0.5 };

export const DECK_OPTIONS = [1, 2, 6, 8];
export const PEN_OPTIONS = { 1: [50, 55, 60, 65, 70, 75], 2: [50, 55, 60, 65, 70, 75, 80, 85], 6: [50, 55, 60, 65, 70, 75, 80, 85, 90], 8: [50, 55, 60, 65, 70, 75, 80, 85, 90] };

export function normalizeRules(r) {
  const o = { ...DEFAULT_RULES, ...r };
  if (!DECK_OPTIONS.includes(o.decks)) o.decks = 6;
  o.h17 = !!o.h17; o.das = !!o.das; o.peek = !!o.peek; o.bj65 = !!o.bj65;
  o.ls = !!o.ls && o.peek; // ホールカードなしの卓のサレンダーは扱わない
  const pens = PEN_OPTIONS[o.decks];
  if (!pens.includes(o.pen)) o.pen = pens.reduce((a, b) => (Math.abs(b - o.pen) < Math.abs(a - o.pen) ? b : a), pens[0]);
  return o;
}

export function ruleKey(r) {
  return `d${r.decks}_${r.h17 ? 'h17' : 's17'}_${r.das ? 'das' : 'nd'}_${r.ls && r.peek ? 'ls' : 'ns'}_${r.peek ? 'peek' : 'enhc'}`;
}

export const PRESETS = [
  { id: 'shoe6', name: '6デッキ・標準', note: 'S17／DAS／深さ75%', rules: { decks: 6, h17: false, das: true, ls: false, peek: true, bj65: false, pen: 75 } },
  { id: 'vegas6', name: '6デッキ・H17', note: 'H17／DAS／サレンダーあり', rules: { decks: 6, h17: true, das: true, ls: true, peek: true, bj65: false, pen: 75 } },
  { id: 'live8', name: '8デッキ・ライブ配信型', note: 'ホールカードなし／深さ50%', rules: { decks: 8, h17: false, das: true, ls: false, peek: false, bj65: false, pen: 50 } },
  { id: 'dd', name: '2デッキ', note: 'H17／DAS／深さ65%', rules: { decks: 2, h17: true, das: true, ls: false, peek: true, bj65: false, pen: 65 } },
  { id: 'sd', name: '1デッキ', note: 'H17／DASなし／深さ60%', rules: { decks: 1, h17: true, das: false, ls: false, peek: true, bj65: false, pen: 60 } },
];

export function describeRules(r) {
  const p = [];
  p.push(`${r.decks}デッキ`);
  p.push(r.h17 ? 'H17' : 'S17');
  p.push(r.das ? 'DAS' : 'DASなし');
  if (r.ls) p.push('サレンダー');
  if (!r.peek) p.push('ホールカードなし');
  if (r.bj65) p.push('BJ 6:5');
  p.push(`深さ${r.pen}%`);
  return p.join('・');
}

// 略語に説明をつけた長い書き方（目次や付録の頭に出す）
export function describeRulesLong(r) {
  const p = [`${r.decks}デッキ`];
  p.push(r.h17 ? 'ディーラーはソフト17で引く（H17）' : 'ディーラーはソフト17で止まる（S17）');
  p.push(r.das ? 'スプリット後のダブルあり（DAS）' : 'スプリット後のダブルなし');
  if (r.ls) p.push('サレンダーあり');
  if (!r.peek) p.push('ホールカードなし');
  if (r.bj65) p.push('ブラックジャックの配当 6:5');
  p.push(`山の${r.pen}%まで配る（深さ${r.pen}%）`);
  return p.join('・');
}

export function normalizeMoney(m) {
  const o = { ...DEFAULT_MONEY, ...m };
  const num = (x, d) => (Number.isFinite(+x) && +x > 0 ? +x : d);
  o.min = Math.round(num(o.min, 1000));
  o.step = Math.round(num(o.step, o.min / 2));
  if (o.step > o.min) o.step = o.min;
  o.max = Math.round(num(o.max, o.min * 10));
  if (o.max < o.min) o.max = o.min;
  // 上限は刻みに合わせる
  o.max = o.min + Math.floor((o.max - o.min) / o.step) * o.step;
  o.bank = Math.round(num(o.bank, 100000));
  o.kelly = Math.min(1.5, Math.max(0.05, num(o.kelly, 0.5)));
  return o;
}

export const KELLY_PRESETS = [
  { k: 1, name: 'フルケリー', note: '伸びは最大。資金の上下も最大' },
  { k: 0.75, name: '3/4ケリー', note: '' },
  { k: 0.5, name: 'ハーフケリー', note: '伸びは75%、振れ幅は半分' },
  { k: 0.25, name: '1/4ケリー', note: '守り重視' },
];

export function kellyName(k) {
  const p = KELLY_PRESETS.find(x => Math.abs(x.k - k) < 1e-9);
  return p ? p.name : `ケリー×${k}`;
}
