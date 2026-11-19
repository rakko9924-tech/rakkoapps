// 第5章 総合問題 — いくら賭ける？ → 配られた。どう打つ？
import { h, fmt, signed, pts, seg } from './dom.js';
import { mixQuestion } from '../quiz.js';
import { tagOf } from '../cards.js';
import { ACT_NAME } from '../strategy.js';
import { kellyName } from '../rules.js';
import { betInput, betVerdict, betSolution, betRuleLabel, actionKeys, playExplain, createSession, optionsBox, nextButton, verdict, tableau, handLabel } from './parts.js';

export function mount(page, app) {
  const st = app.state, data = app.data;
  let ses;

  const opts = optionsBox('出題の設定',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '資金'),
      seg([{ value: false, label: 'いつも同じ' }, { value: true, label: '毎回変える' }], st.opts.varyBank, v => { st.opts.varyBank = v; app.save(); start(); })));

  function start() {
    page.replaceChildren();
    ses = createSession(page, app, { chapter: '第5章', title: '総合問題', drill: 'mix', extraHead: opts });
    ask();
  }

  function ask() {
    const m = data.money;
    const q = mixQuestion(app.rng, { rows: data.rows, money: m, chart: data.chart, devs: data.devs, ins: data.ins, rules: st.rules, useIdx: data.useIdx, decks: st.rules.decks, pen: st.rules.pen, varyBank: st.opts.varyBank });
    const betQ = { bank: q.bank, tc: q.tc0, rc: q.rc0, decksLeft: q.decksLeft, row: q.row, raw: q.raw, answer: q.bet };
    const no = ses.qno();
    const box1 = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${no}（1）賭ける`),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, 'いまの資金'), h('span', { class: 'fact__v' }, ...pts(q.bank))),
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, 'ベットの範囲'), h('span', { class: 'fact__v' }, `${fmt(m.min)}〜${fmt(m.max)}`)),
        h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, 'ランニングカウント'), h('span', { class: 'fact__v' }, signed(q.rc0))),
        h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, '残りデッキ'), h('span', { class: 'fact__v' }, String(q.decksLeft)))),
      h('p', { class: 'q__text', style: { marginTop: 'var(--space-xs)' } }, 'いくら賭ける？'),
      h('p', { class: 'q__sub' }, `${betRuleLabel(q.bank, m)}・${fmt(m.step)}点刻み・賭けないは選べない`));
    const after1 = h('div', { class: 'stack' });
    const part2 = h('div', { class: 'stack' });
    let r1 = null;
    const input = betInput({ money: m, submitLabel: 'この額で賭ける', onSubmit: (v) => {
      const bv = betVerdict(v, betQ, m);
      r1 = bv.result;
      input.reveal(q.bet);
      app.sfx.play('chip');
      after1.replaceChildren(verdict(bv.kind, bv.text, bv.sub), betSolution(betQ, m, data, v));
      deal(v);
    } });
    ses.body.replaceChildren(box1, input.el, after1, part2);

    function deal() {
      const shown = [...q.cards, q.upCard];
      const tags = shown.map(tagOf).map(signed).join('、');
      const box2 = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${no}（2）打つ`),
        tableau({ upCard: q.upCard, cards: q.cards, info: q.info }),
        h('p', { class: 'q__sub', style: { marginTop: 'var(--space-xs)' } }, `配られた3枚は ${tags}。ランニングカウントは ${signed(q.rc0)} → `, h('b', null, signed(q.rc1)), `（残り${q.decksLeft}デッキ）`),
        h('p', { class: 'q__text' }, 'どう打つ？'));
      const after2 = h('div', { class: 'stack' });
      const keys = actionKeys({ can: q.can, rules: st.rules, onPick: (a) => {
        const ok = a === q.answer; keys.mark(a, q.answer);
        const both = ok && r1 === 'ok' ? 'ok' : (ok && r1 === 'near' ? 'near' : 'ng');
        ses.add(both);
        after2.replaceChildren(
          verdict(ok ? 'ok' : 'ng', ok ? '正解' : '不正解', `${handLabel(q.info)} → ${ACT_NAME[q.answer]}`),
          h('div', { class: 'sol' }, h('span', { class: 'sol__line' }, `${signed(q.rc1)} ÷ ${q.decksLeft} ＝ ${(q.rc1 / q.decksLeft).toFixed(1).replace('-', '−')} → トゥルーカウント `, h('b', null, signed(q.tc1)))),
          playExplain({ info: q.info, up: q.up, tc: q.tc1, answer: q.answer, base: q.base, used: q.used, devs: data.devs }),
          nextButton(ses.done() ? '採点を見る' : '次の問題', () => (ses.done() ? ses.summary({ onAgain: start, notes: ['賭け金と打ち方の両方が合って正解'] }) : ask())));
      } });
      part2.replaceChildren(box2, keys.el, after2);
      app.sfx.play('deal');
      queueMicrotask(() => box2.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    }
  }
  start();
}
