// 練習ページで共通に使う部品: 賭け金の入力、打ち方の選択、解説、採点のまとめ
import { h, fmt, signed, pts, betLine, verdict, progMarks, pageHead, markSvg, cardEl, seg } from './dom.js';
import { kellyRaw, gradeBet, ruinModel, pctSmart, ramp, metrics } from '../betting.js';
import { kellyName } from '../rules.js';
import { ACT_NAME, upLabel, devText } from '../strategy.js';
import { adBox } from '../ads.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 画面の外にある部品を、見える位置まで送る（見えていれば動かさない）
export function bringIntoView(el) {
  if (!el) return;
  requestAnimationFrame(() => { if (el.isConnected) el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); });
}

// 金額を「38万」のように短く
export const man = (x) => (x >= 1e8 ? `${(x / 1e8).toFixed(1)}億` : x >= 1e4 ? `${Math.round(x / 1e4)}万` : fmt(x));

// ---- 賭け金の入力（数直線＋1刻みずつ動かすボタン） ----
export function betInput({ money, initial, submitLabel = '答え合わせ', onSubmit }) {
  const val = h('div', { class: 'betval', 'aria-live': 'polite' });
  const paint = (v) => val.replaceChildren(...pts(v));
  const line = betLine({ money, value: initial ?? money.min, onChange: paint });
  const minus = h('button', { type: 'button', class: 'btn', 'aria-label': '1刻み減らす', onclick: () => line.nudge(-1) }, '−');
  const plus = h('button', { type: 'button', class: 'btn', 'aria-label': '1刻み増やす', onclick: () => line.nudge(1) }, '+');
  const submit = h('button', { type: 'button', class: 'btn btn--primary btn--wide', onclick: () => onSubmit(line.value) }, submitLabel);
  paint(line.value);
  const el = h('div', { class: 'stack' }, h('div', { class: 'betrow' }, minus, val, plus), line.el, submit);
  return {
    el, submit, get value() { return line.value; },
    reveal(ans) { line.reveal(ans); minus.disabled = plus.disabled = true; submit.remove(); },
  };
}

const pc = (x, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;
const sgn = (x) => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x))}`;
const times = (r) => `${+r.toFixed(1)}倍`;

// 賭け金の採点（丸・三角・バツと一言）
export function betVerdict(user, q, money) {
  const g = gradeBet(user, q.answer, money);
  if (g === 'ok') return { kind: 'ok', result: 'ok', text: '正解', sub: `${fmt(q.answer)}点` };
  const over = user > q.answer;
  return {
    kind: g === 'near' ? 'near' : 'ng', result: g === 'near' ? 'near' : 'ng',
    text: over ? '賭けすぎ' : '賭けなさすぎ',
    sub: `正解は ${fmt(q.answer)}点（あなたは ${fmt(user)}点）`,
  };
}

// いまの資金で使う賭け方の名前（問題文に出す）
export function betRuleLabel(bank, money) {
  if (money.hopeless) return '有利なら最大ベット';
  return (money.base || 0) > money.kelly * bank ? '破産リスクが最小の賭け方' : kellyName(money.kelly);
}

// この条件の賭け金表を1行にまとめる（同じ額が続くカウントはまとめ、いまのカウントに印をつける）
export function rampStrip(bank, rows, money, tcNow) {
  const rp = ramp(bank, rows, money).filter(r => r.f >= 5e-4 || r.tc === tcNow);
  const groups = [];
  for (const r of rp) { const g = groups[groups.length - 1]; if (g && g.bet === r.bet) { g.hi = r.tc; if (r.tc === tcNow) g.now = true; } else groups.push({ lo: r.tc, hi: r.tc, bet: r.bet, now: r.tc === tcNow }); }
  const label = (g, i) => (i === 0 ? `${signed(g.hi)}まで` : i === groups.length - 1 && g.lo !== g.hi ? `${signed(g.lo)}〜` : g.lo === g.hi ? signed(g.lo) : `${signed(g.lo)}〜${signed(g.hi)}`);
  return h('div', { class: groups.length >= 7 ? 'rampstrip rampstrip--dense' : 'rampstrip', role: 'table', 'aria-label': 'この条件の賭け金表（トゥルーカウントごと）' },
    groups.map((g, i) => h('div', { class: g.now ? 'rampstrip__cell is-now' : 'rampstrip__cell', role: 'row' }, h('span', { class: 'rampstrip__tc', role: 'cell' }, label(g, i)), h('span', { class: 'rampstrip__bet', role: 'cell' }, fmt(g.bet)))));
}

// 賭け金の決め方を、ふつうの言葉で1〜2行に（やり方の説明と解説で同じ言い方を使う）
export function betRuleLines(bank, money) {
  if (money.hopeless) return [['この卓は、最大ベットまで賭けても全体では負けます。有利なカウントでは最大ベット、それ以外は最低ベットにして、少しでも取り返します。']];
  const base = money.base || 0;
  if (base > money.kelly * bank) {
    return [
      [`資金 ${fmt(bank)}点は最低ベットの${fmt(bank / money.min)}倍しかありません。この資金どおりに小さく賭けると、不利なときの最低ベットで少しずつ削られる分を取り返せず、かえって破産しやすくなります。`],
      ['そこで、破産リスクが最小になる ', h('b', null, `「資金 約${man(base)}点のつもり」`), ` で賭けます。資金が約${man(base / money.kelly)}点を超えたら、${kellyName(money.kelly)}（資金×${money.kelly}）どおりに賭けます。`],
    ];
  }
  return [[`資金が十分あるので、${kellyName(money.kelly)}（資金×${money.kelly} ＝ ${fmt(money.kelly * bank)}点ぶん）で賭けます。`]];
}

// 賭け金の途中式（短く: 使う賭け方 → 計算 → まちがえたときの一言）
export function betSolution(q, money, data, user) {
  const { row, bank } = q, L = [];
  const say = (...k) => L.push(h('span', { class: 'sol__line' }, ...k));
  const calc = (...k) => L.push(h('span', { class: 'sol__line sol__line--calc' }, ...k));
  const full = kellyRaw(bank, row, 1);
  const base = money.base || 0, useBase = !money.hopeless && base > money.kelly * bank;
  if (q.rc !== undefined && q.decksLeft !== undefined) {
    const ex = q.rc / q.decksLeft;
    calc(h('b', null, `${signed(q.rc)} ÷ 残り${q.decksLeft}デッキ`), Number.isInteger(ex) ? ' ＝ トゥルーカウント ' : ` ＝ ${ex.toFixed(1).replace('-', '−')} → 切り下げて トゥルーカウント `, h('b', null, signed(q.tc)));
  }
  if (row.e <= 0) {
    say(`トゥルーカウント ${signed(q.tc)} は不利（優位 ${pc(row.e)}）→ `, h('span', { class: 'ans' }, `最低ベットの ${fmt(money.min)}点`), '。賭けないは選べない');
  } else if (money.hopeless) {
    say('この卓は、最大まで賭けても全体では負ける。有利なカウントは ', h('span', { class: 'ans' }, `最大ベットの ${fmt(money.max)}点`), ' で少しでも取り返す');
  } else {
    const scale = useBase ? base : money.kelly * bank;
    if (useBase) say(`資金 ${fmt(bank)}点では少なすぎるので、破産リスクが最小になる `, h('b', null, `「資金 約${man(base)}点のつもり」`), ' で計算（理由は第3章のやり方・付録A）');
    else say(`資金が十分なので ${kellyName(money.kelly)}`, money.kelly === 1 ? '' : `（資金×${money.kelly} ＝ ${fmt(scale)}点ぶん）`, ' で計算');
    const tail = q.raw < money.min ? ['→ 最低ベットに届かないので ', h('span', { class: 'ans' }, `${fmt(money.min)}点`)]
      : q.raw >= money.max ? ['→ 最大ベットで頭打ち ', h('span', { class: 'ans' }, `${fmt(money.max)}点`)]
      : [`→ ${fmt(money.step)}点刻みで `, h('span', { class: 'ans' }, `${fmt(q.answer)}点`)];
    calc(`${fmt(scale)} × 優位 ${(row.e * 100).toFixed(2)}% ÷ 振れ幅 ${row.m.toFixed(2)} ＝ ${fmt(q.raw)} `, ...tail);
  }
  if (user !== undefined && user !== q.answer) {
    const over = user > q.answer, neg = row.e <= 0;
    let msg;
    if (over) msg = neg ? '不利なカウントで増やすと、負けが大きくなるだけ' : (!useBase && full > 0 && user / full > 2) ? 'フルケリーの2倍を超えると、勝てる勝負でも資金は減っていく' : '賭けすぎると振れ幅が大きくなり、破産が近づく';
    else msg = useBase ? '小さすぎると、最低ベットで削られる分を取り返せない' : '小さすぎると、有利な場面の利益を取りこぼす';
    // 1問だけでは差が小さいので「いつもこの向きにずらして賭けたら」で比べる
    let extra = null;
    try {
      const ratio = user / q.answer, mult = {};
      for (const r of data.rows) if ((r.e <= 0) === neg) mult[r.tc] = neg ? user / money.min : ratio;
      const who = neg ? `不利なカウントでいつも ${fmt(user)}点 賭けると` : `有利なカウントでいつも正解の${times(ratio)}で賭けると`;
      if (!useBase && !over && !neg && !money.hopeless) {
        // 資金が十分あるときに小さく賭けるのは、守りに寄るだけ。伸び（期待値）で比べる
        const ev0 = metrics(ramp(bank, data.rows, money)).mu * 100, ev1 = metrics(ramp(bank, data.rows, money, mult)).mu * 100;
        if (sgn(ev0) !== sgn(ev1)) extra = [`（${who}、100ハンドの期待値 ${sgn(ev0)}点 → `, h('b', null, `${sgn(ev1)}点`), '）'];
      } else {
        const b0 = ruinModel(data.rows, money).ruinAt(bank), b1 = ruinModel(data.rows, money, { mult }).ruinAt(bank);
        if (pctSmart(b0) !== pctSmart(b1)) extra = [`（${who}、破産リスク ${pctSmart(b0)} → `, h('b', null, pctSmart(b1)), '）'];
      }
    } catch { /* 目安なので、計算できなければ出さない */ }
    say(msg, ...(extra || []));
  }
  return h('div', { class: 'stack' }, h('div', { class: 'sol sol--box' }, L), rampStrip(bank, data.rows, money, row.tc));
}

// ---- 打ち方 ----
export function handLabel(info) {
  if (info.pairVal) return info.pairVal === 1 ? 'Aのペア' : `${info.pairVal}のペア`;
  return `${info.soft ? 'ソフト' : 'ハード'}${info.total}`;
}

const ACTS = ['H', 'S', 'D', 'P', 'R'];
export function actionKeys({ can, rules, onPick, includeSurrender = !!(rules && rules.ls && rules.peek) }) {
  const btns = {};
  // 4つなら 2×2、5つ（サレンダーあり）なら 3列
  const el = h('div', { class: includeSurrender ? 'keys keys--3' : 'keys' });
  for (const a of ACTS) {
    if (a === 'R' && !includeSurrender) continue;
    const ok = a === 'H' || a === 'S' || !!can[a];
    btns[a] = h('button', { type: 'button', class: 'btn', disabled: !ok, onclick: () => onPick(a) }, ACT_NAME[a]);
    el.append(btns[a]);
  }
  return {
    el,
    mark(picked, right) {
      for (const [a, b] of Object.entries(btns)) { b.disabled = true; if (a === picked) b.classList.add('is-picked'); if (a === right) b.classList.add('is-right'); }
    },
    setCan(c) { for (const [a, b] of Object.entries(btns)) b.disabled = !(a === 'H' || a === 'S' || !!c[a]); },
    lock() { for (const b of Object.values(btns)) b.disabled = true; },
  };
}
export function yesNoKeys({ yes, no, onPick }) {
  const by = h('button', { type: 'button', class: 'btn', onclick: () => onPick('Y') }, yes);
  const bn = h('button', { type: 'button', class: 'btn', onclick: () => onPick('N') }, no);
  return { el: h('div', { class: 'keys' }, by, bn), mark(picked, right) { for (const [a, b] of [['Y', by], ['N', bn]]) { b.disabled = true; if (a === picked) b.classList.add('is-picked'); if (a === right) b.classList.add('is-right'); } } };
}

// 打ち方の解説
export function playExplain({ info, up, tc, answer, base, used, devs }) {
  const L = [];
  const line = (...k) => L.push(h('span', { class: 'sol__line' }, ...k));
  const who = `${handLabel(info)} 対 ${upLabel(up)}`;
  const related = (devs || []).filter(d => d.up === up && (d.kind === 'P' ? info.pairVal === d.total : d.kind === (info.soft ? 'S' : 'H') && d.total === info.total && (d.hi !== 'D' || info.n === 2) && (d.hi !== 'R' || info.n === 2)));
  if (used) {
    line(`${who}：基本戦略は${ACT_NAME[base]}`);
    line(devText(used));
    line(`いまは ${signed(tc)} → `, h('span', { class: 'ans' }, ACT_NAME[answer]));
  } else if (related.length) {
    line(devText(related[0]));
    line(`いまは ${signed(tc)} → `, h('span', { class: 'ans' }, ACT_NAME[answer]), '（基本戦略と同じ）');
  } else {
    line(`${who}：カウントに関係なく `, h('span', { class: 'ans' }, ACT_NAME[answer]), '（基本戦略）');
  }
  return h('div', { class: 'sol' }, L);
}

export function insExplain({ tc, ins, answer }) {
  return h('div', { class: 'sol' },
    h('span', { class: 'sol__line' }, `保険は、相手の伏せ札が10である確率が 1/3 を超えるときだけ得になる`),
    h('span', { class: 'sol__line' }, `目安はトゥルーカウント ${signed(ins)} 以上。いまは ${signed(tc)} → `, h('span', { class: 'ans' }, answer === 'Y' ? '入る' : '入らない')));
}

// ---- 1回ぶんの練習（10問）の枠 ----
export function createSession(page, app, { chapter, title, total = 10, drill, extraHead }) {
  const results = [];
  let cur = 1, token = 0, finished = false;
  const prog = h('div', { class: 'prog block' });
  const body = h('div', { class: 'stack' });
  page.append(pageHead({ chapter, title }), extraHead || '', prog, body);
  const paint = () => prog.replaceChildren(h('span', null, finished ? `${total}問 終わり` : `問 ${cur} / ${total}`), progMarks(results, total));
  paint();
  return {
    body, results, total,
    // 出す問題の番号（上の「問 N / 10」も、答え合わせのあいだはこの番号のまま）
    qno() { cur = results.length + 1; token++; paint(); return cur; },
    add(r) { results.push(r); app.record(drill, r === 'ok' ? 1 : 0); app.sfx.play(r === 'ok' ? 'ok' : 'ng'); paint(); },
    done: () => results.length >= total,
    // 「正解したらすぐ次へ」の設定のとき、丸を少し見せてから次へ進む
    auto(ok, next) {
      if (!ok || !app.state.opts.quick) return;
      const my = token;
      setTimeout(() => { if (my === token && body.isConnected) next(); }, 750);
    },
    // まとめのページ
    summary({ onAgain, notes = [] }) {
      token++; finished = true; paint();
      const ok = results.filter(r => r === 'ok').length, near = results.filter(r => r === 'near').length;
      const kind = ok === total ? 'ok' : ok >= total * 0.7 ? 'near' : 'ng';
      body.replaceChildren(
        h('div', { class: 'q' }, h('span', { class: 'q__no' }, '採点'),
          h('div', { class: 'row' }, markSvg(kind), h('p', { class: 'hand red', style: { fontSize: 'var(--text-3xl)', lineHeight: '1.1' } }, `${ok}`, h('small', { style: { fontSize: 'var(--text-lg)' } }, ` / ${total} 問`))),
          near ? h('p', { class: 'pencil' }, `惜しい（1刻みずれ）: ${near}問`) : null,
          notes.map(n => h('p', { class: 'pencil' }, n))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--primary grow', onclick: onAgain }, 'もう一度'), h('a', { class: 'btn grow', href: '#/' }, '目次へ')));
      body.querySelector('button').focus({ preventScroll: true });
      // 区切りの画面なので、いちばん下に広告（章ごとに足すリンクのさらに下）
      queueMicrotask(() => { const ad = adBox(); if (ad && body.isConnected) body.append(ad); });
    },
  };
}

// 「正解したとき」の切り替え（解説を見る／すぐ次へ）
export function quickField(app) {
  const o = app.state.opts;
  return h('div', { class: 'field' }, h('span', { class: 'field__label' }, '正解したとき'),
    seg([{ value: false, label: '解説を見る' }, { value: true, label: 'すぐ次へ' }], !!o.quick, v => { o.quick = v; app.save(); }),
    h('span', { class: 'field__hint' }, '「すぐ次へ」は、正解なら丸を見せて自動で次の問題へ進みます。まちがえたときは解説が出ます。'));
}

// やり方の箱（章のはじめに1回だけ出す）
export function howTo(...kids) {
  return h('section', { class: 'q howto' }, h('span', { class: 'q__no' }, 'やり方'), ...kids);
}

// 出題の設定（開閉する）。閉じているあいだ中身は display:none にして、押せない部品を画面に残さない
let optsSeq = 0;
export function optionsBox(summaryText, ...controls) {
  const id = `opts-${++optsSeq}`;
  const body = h('div', { class: 'stack opts__body', id, hidden: true }, controls);
  const btn = h('button', { type: 'button', class: 'opts__toggle', 'aria-expanded': 'false', 'aria-controls': id, onclick: () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  } }, summaryText);
  return h('div', { class: 'opts' }, btn, body);
}

// 次へボタン（Enter でも進める）
export function nextButton(label, onNext) {
  const b = h('button', { type: 'button', class: 'btn btn--primary btn--wide', onclick: onNext }, label);
  queueMicrotask(() => { if (b.isConnected) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } });
  return b;
}

export { verdict };

// 相手の札と自分の手を並べて見せる
export function tableau({ upCard, cards, info, animate = true }) {
  return h('div', { class: 'tableau' },
    h('div', { class: 'tableau__side' }, h('span', { class: 'fact__k' }, '相手の札'), h('div', { class: 'hand-cards hand-cards--open' }, cardEl(upCard, { size: 'md', animate }))),
    h('div', { class: 'tableau__side' }, h('span', { class: 'fact__k' }, `あなたの手（${handLabel(info)}）`), h('div', { class: 'hand-cards hand-cards--open' }, cards.map(c => cardEl(c, { size: 'md', animate })))));
}
