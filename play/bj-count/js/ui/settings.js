// 条件: お金・卓の決まり・打ち方
import { h, fmt, pageHead, seg } from './dom.js';
import { DECK_OPTIONS, PEN_OPTIONS, PRESETS, KELLY_PRESETS, normalizeRules, normalizeMoney, describeRulesLong, kellyName } from '../rules.js';
import { ruinModel, pctSmart } from '../betting.js';
import { defaults } from '../store.js';
import { man } from './parts.js';

export const needsData = false;

export function mount(page, app) {
  const st = app.state;
  let alive = true;
  const body = h('div', { class: 'stack stack--lg' });
  const saved = h('p', { class: 'note saved block', role: 'status' }, '変えたところは、その場で保存されます。');
  page.append(pageHead({ title: '条件', tool: h('span') }), saved, body);

  // 保存の知らせは1行の高さのまま（欄の位置をずらさない）
  let savedTimer = null;
  const commit = () => {
    st.rules = normalizeRules(st.rules); st.money = normalizeMoney(st.money); app.save(); app.sfx.setEnabled(st.opts.sound);
    saved.textContent = '✓ 保存しました（すべての章に反映）';
    saved.classList.add('is-on'); clearTimeout(savedTimer); savedTimer = setTimeout(() => saved.classList.remove('is-on'), 1600);
  };
  // 選択肢そのものが変わるとき（デッキ数・ホールカード・用意した型）だけ作り直す。それ以外は保存して文字だけ直す
  const redraw = () => { commit(); draw(); };
  let ruleLine = null;
  const refreshRules = () => { commit(); if (ruleLine) ruleLine.textContent = describeRulesLong(st.rules); };

  function field(label, control, hint) {
    return h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), control, hint ? h('span', { class: 'field__hint' }, hint) : null);
  }
  const inputs = {};
  const bankNote = h('p', { class: 'note', role: 'status' });
  // 資金やベットを変えたとき: 賭け金表が変わるか、破産リスクがどう動くか（目安）
  async function explainMoney(prevBank) {
    try {
      const data = await app.ensureData();
      if (!alive) return;
      const m = data.money, model = ruinModel(data.rows, m);
      const r1 = model.ruinAt(m.bank), r0 = prevBank && prevBank !== m.bank ? model.ruinAt(prevBank) : null;
      const risk = r0 !== null && pctSmart(r0) !== pctSmart(r1) ? `破産リスク ${pctSmart(r0)} → ${pctSmart(r1)}` : `破産リスク ${pctSmart(r1)}`;
      if (m.hopeless) bankNote.textContent = 'この条件では、最大ベットまで賭けても全体の期待値がマイナスです（どう賭けても破産に向かう）。';
      else if (m.base > m.kelly * m.bank) bankNote.textContent = `この資金では「資金 約${man(m.base)}点のつもり」で賭けます。資金が約${man(m.base / m.kelly)}点を超えるまで、賭け金表は変わりません（変わるのは破産リスク）。${risk}。`;
      else bankNote.textContent = `資金が十分なので、${kellyName(m.kelly)}（資金×${m.kelly}）どおりに賭けます。${risk}。`;
    } catch { bankNote.textContent = ''; }
  }
  function moneyInput(key, label, hint) {
    const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: fmt(st.money[key]), 'aria-label': label });
    inputs[key] = input;
    const apply = () => {
      const v = parseInt(String(input.value).replace(/[^\d]/g, ''), 10);
      if (!Number.isFinite(v) || v <= 0) { input.setAttribute('aria-invalid', 'true'); input.value = fmt(st.money[key]); return; }
      input.removeAttribute('aria-invalid');
      const prevBank = st.money.bank;
      st.money[key] = Math.min(v, 1e12);
      // 刻みは最低ベットを超えない。最大は最低以上
      if (key === 'min' && st.money.step > st.money.min) st.money.step = st.money.min;
      commit();
      // 直された値（刻みに合わせた最大など）を、ほかの欄にも映す（欄は作り直さない）
      for (const [k, el] of Object.entries(inputs)) if (el !== document.activeElement) el.value = fmt(st.money[k]);
      explainMoney(prevBank);
    };
    input.addEventListener('change', apply);
    input.addEventListener('focus', () => { input.value = String(st.money[key]); input.select(); });
    input.addEventListener('blur', () => { input.value = fmt(st.money[key]); });
    return field(label, input, hint);
  }

  function draw() {
    const r = st.rules, m = st.money;
    const pens = PEN_OPTIONS[r.decks];
    const set = (k, v, structural = false) => { r[k] = v; if (structural) redraw(); else refreshRules(); };
    ruleLine = h('p', { class: 'cond__line block' }, describeRulesLong(r));
    body.replaceChildren(
      h('section', { class: 'stack' },
        h('h2', { class: 'sec', style: { marginTop: 0 } }, 'お金'),
        moneyInput('bank', '資金（点）'),
        bankNote,
        h('div', { class: 'facts' }, moneyInput('min', '最低ベット'), moneyInput('max', '最大ベット')),
        moneyInput('step', '賭け金の刻み', '最低ベットにこの刻みを足した額だけ賭けられます。'),
        field('どこまで攻めるか', seg(KELLY_PRESETS.map(k => ({ value: k.k, label: k.name.replace('ケリー', '') })), m.kelly, v => { st.money.kelly = v; commit(); explainMoney(); }),
          '資金が十分あるときに、ケリー基準（資金×優位÷振れ幅）の何倍で賭けるか。フルは伸びが最大で上下も最大、ハーフは伸びが約75%で振れ幅が半分。資金が少ないあいだは、破産リスクが最小になる賭け方を下回りません。')),

      h('section', { class: 'stack' },
        h('h2', { class: 'sec' }, '卓の決まり'),
        ruleLine,
        h('div', { class: 'row row--wrap' }, PRESETS.map(p => h('button', { type: 'button', class: 'btn btn--small', onclick: () => { st.rules = { ...p.rules }; redraw(); } }, p.name))),
        field('デッキ数', seg(DECK_OPTIONS.map(d => ({ value: d, label: `${d}デッキ` })), r.decks, v => set('decks', v, true))),
        field('ディーラーのソフト17', seg([{ value: false, label: '止まる（S17）' }, { value: true, label: '引く（H17）' }], r.h17, v => set('h17', v))),
        field('スプリット後のダブル', seg([{ value: true, label: 'できる（DAS）' }, { value: false, label: 'できない' }], r.das, v => set('das', v))),
        field('ホールカード', seg([{ value: true, label: 'あり（BJを先に確認）' }, { value: false, label: 'なし' }], r.peek, v => set('peek', v, true)),
          'なしの卓では、相手がブラックジャックのとき、ダブルやスプリットで増やした分も失います。'),
        field('サレンダー', seg([{ value: false, label: 'なし' }, { value: true, label: 'あり', disabled: !r.peek }], r.ls, v => set('ls', v)), r.peek ? null : 'ホールカードなしの卓のサレンダーは扱っていません。'),
        field('ブラックジャックの配当', seg([{ value: false, label: '3:2（1.5倍）' }, { value: true, label: '6:5（1.2倍）' }], r.bj65, v => set('bj65', v))),
        field('どこまで配るか（深さ）', seg(pens.map(p => ({ value: p, label: `${p}%` })), r.pen, v => set('pen', v), { wrap: true }), '山の何%まで配ってから混ぜ直すか。深いほど、高いカウントが出やすくなります。')),

      h('section', { class: 'stack' },
        h('h2', { class: 'sec' }, '打ち方'),
        field('カウントで打ち方を変えるか', seg([{ value: 'ix', label: '変える' }, { value: 'bs', label: '基本戦略だけ' }], st.strat, v => { st.strat = v; commit(); }),
          '「変える」は、16対10や保険などをカウントで切り替えます（付録Bに一覧）。賭け金の正解も、その打ち方の優位で計算します。')),

      h('section', { class: 'stack' },
        h('h2', { class: 'sec' }, 'そのほか'),
        field('文字の大きさ', seg([{ value: false, label: 'ふつう' }, { value: true, label: '大きい' }], !!st.opts.bigText, v => { st.opts.bigText = v; commit(); app.applyTextSize(); })),
        field('音', seg([{ value: true, label: 'あり' }, { value: false, label: 'なし' }], st.opts.sound, v => { st.opts.sound = v; commit(); })),
        resetRow()),
      h('div', { class: 'stack' },
        h('a', { class: 'btn btn--wide', href: '#/calc' }, 'この条件の賭け金表を見る（付録A）'),
        h('a', { class: 'btn btn--primary btn--wide', href: '#/' }, '目次へ戻る')));
  }

  function resetRow() {
    const msg = h('span', { class: 'note', role: 'status' });
    let backup = null;
    const btn = h('button', { type: 'button', class: 'btn btn--small', onclick: () => {
      if (backup) { Object.assign(st, backup); backup = null; app.save(); btn.textContent = '成績を消す'; msg.textContent = '元に戻しました。'; return; }
      backup = { stats: st.stats, best: st.best, daily: st.daily, tableSave: st.tableSave };
      const d = defaults();
      st.stats = d.stats; st.best = d.best; st.daily = d.daily; st.tableSave = d.tableSave;
      app.save(); btn.textContent = '元に戻す'; msg.textContent = '成績（日ごとの記録・実戦の続きも）を消しました。';
    } }, '成績を消す');
    return h('div', { class: 'row row--wrap block' }, btn, msg);
  }

  draw();
  explainMoney();
  return () => { alive = false; clearTimeout(savedTimer); };
}
