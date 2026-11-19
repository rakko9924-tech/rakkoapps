// 第3章 賭ける — 資金・カウント・最低〜最大ベットから、賭け金を決める
import { h, fmt, signed, pts, seg, pageHead } from './dom.js';
import { betQuestion } from '../quiz.js';
import { kellyName } from '../rules.js';
import { ruinModel, pctSmart } from '../betting.js';
import { betInput, betVerdict, betSolution, betRuleLabel, betRuleLines, rampStrip, createSession, optionsBox, nextButton, verdict, quickField, howTo, man } from './parts.js';

export function mount(page, app) {
  const st = app.state, data = app.data;
  let ses, input = null, prev = null;

  const opts = optionsBox('出題の設定',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'カウントの見せ方'),
      seg([{ value: false, label: 'トゥルーカウントを表示' }, { value: true, label: '自分で割る' }], st.opts.hideTc, v => { st.opts.hideTc = v; app.save(); start(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '資金'),
      seg([{ value: false, label: 'いつも同じ' }, { value: true, label: '毎回変える' }], st.opts.varyBank, v => { st.opts.varyBank = v; app.save(); start(); })),
    quickField(app));

  function intro() {
    const m = data.money;
    const firstPos = data.rows.find(r => r.e > 0 && r.f >= 5e-4);
    const neg = firstPos ? `トゥルーカウント ${signed(firstPos.tc - 1)} 以下は不利。` : '';
    const useBase = !m.hopeless && (m.base || 0) > m.kelly * m.bank;
    page.replaceChildren(pageHead({ chapter: '第3章', title: '賭ける' }), opts,
      h('div', { class: 'stack' },
        howTo(
          h('p', { class: 'q__text' }, '目標: この表を覚えて、カウントを見たらすぐその額を置く'),
          h('p', { class: 'field__label', style: { marginTop: 'var(--space-xs)' } }, `いまの条件の賭け金表（資金 ${fmt(m.bank)}点・トゥルーカウントごと）`),
          rampStrip(m.bank, data.rows, m, null),
          h('ol', { class: 'howto__steps', style: { marginTop: 'var(--space-sm)' } },
            h('li', null, `① ${neg}不利なときは最低ベットの ${fmt(m.min)}点。賭けないは選べません`),
            h('li', null, '② 有利なカウントほど上げます（上の表のとおり）。実際のカウンターも、卓に着く前にこの表を作って覚えておきます'),
            h('li', null, `③ 表の作り方: 賭け金 ＝ 基準の資金 × 優位 ÷ 振れ幅 を、${fmt(m.min)}〜${fmt(m.max)}点に収めて ${fmt(m.step)}点刻みに丸める`)),
          optionsBox(useBase ? `なぜ約${man(m.base)}点のつもりなの？` : '基準の資金・優位・振れ幅とは',
            h('div', { class: 'sol sol--box' }, betRuleLines(m.bank, m).map(l => h('span', { class: 'sol__line' }, ...l))),
            h('p', { class: 'q__sub' }, '優位＝そのカウントで1点賭けたときの平均の儲け（+0.5% など）。振れ幅＝1回の勝ち負けの大きさ（約1.3。ダブルやスプリットで増える）。'))),
        h('button', { type: 'button', class: 'btn btn--primary btn--wide', onclick: start }, '始める')));
  }

  function start() {
    page.replaceChildren();
    ses = createSession(page, app, { chapter: '第3章', title: '賭ける', drill: 'bet', extraHead: opts });
    ask();
  }

  function ask() {
    const m = data.money;
    const q = betQuestion(app.rng, { rows: data.rows, money: m, decks: st.rules.decks, pen: st.rules.pen, varyBank: st.opts.varyBank, hideTc: st.opts.hideTc, prev });
    prev = q;
    const facts = h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, 'いまの資金'), h('span', { class: 'fact__v' }, ...pts(q.bank))),
      h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, 'ベットの範囲'), h('span', { class: 'fact__v' }, `${fmt(m.min)}〜${fmt(m.max)}`)),
      q.rc === undefined
        ? h('div', { class: 'fact fact--key fact--wide' }, h('span', { class: 'fact__k' }, 'トゥルーカウント'), h('span', { class: 'fact__v' }, signed(q.tc)))
        : [h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, 'ランニングカウント'), h('span', { class: 'fact__v' }, signed(q.rc))),
           h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, '残りデッキ'), h('span', { class: 'fact__v' }, String(q.decksLeft)))]);
    const box = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${ses.qno()}`), facts,
      h('p', { class: 'q__text', style: { marginTop: 'var(--space-xs)' } }, 'いくら賭ける？'),
      h('p', { class: 'q__sub' }, `${betRuleLabel(q.bank, m)}・${fmt(m.step)}点刻み・賭けないは選べない`));
    const after = h('div', { class: 'stack' });
    input = betInput({ money: m, onSubmit: (v) => grade(q, v, after) });
    ses.body.replaceChildren(box, input.el, after);
  }

  const goNext = () => (ses.done() ? finish() : ask());
  function grade(q, user, after) {
    const m = data.money;
    const v = betVerdict(user, q, m);
    input.reveal(q.answer);
    ses.add(v.result);
    after.replaceChildren(
      verdict(v.kind, v.text, v.sub),
      betSolution(q, m, data, user),
      nextButton(ses.done() ? '採点を見る' : '次の問題', goNext));
    ses.auto(v.result === 'ok', goNext);
  }

  function finish() {
    const m = data.money;
    const notes = [`資金 ${fmt(m.bank)}点・ベット ${fmt(m.min)}〜${fmt(m.max)}点・${kellyName(m.kelly)}`];
    try {
      const model = ruinModel(data.rows, m), need = model.bankFor(0.05);
      notes.push(`この条件で打ち続けたときの破産リスク: ${pctSmart(model.ruinAt(m.bank))}`);
      if (need && need > m.bank * 1.05) notes.push(`破産リスクを5%にするには、資金 約${fmt(Math.ceil(need / 1000) * 1000)}点`);
    } catch { /* 目安なので、出せなければ省く */ }
    ses.summary({ onAgain: start, notes });
    // 9問以上できたら、1段むずかしい出し方をすすめる（自分で割る → 資金を毎回変える）
    const ok = ses.results.filter(r => r === 'ok').length;
    const up = ok >= 9 ? (!st.opts.hideTc ? { key: 'hideTc', label: '1段上げる: ランニングカウントから自分で割る' } : !st.opts.varyBank ? { key: 'varyBank', label: '1段上げる: 資金を毎回変える' } : null) : null;
    if (up) ses.body.append(h('button', { type: 'button', class: 'btn btn--wide', onclick: () => { st.opts[up.key] = true; app.save(); start(); } }, up.label));
    ses.body.append(h('p', { class: 'row' }, h('a', { class: 'btn btn--wide', href: '#/calc' }, 'この条件の賭け金表を見る（付録A）')));
  }

  intro();
}
