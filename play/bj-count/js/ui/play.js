// 第4章 打つ — カウントで変わるヒット・スタンド・ダブル・スプリット・サレンダー・保険
import { h, signed, seg, cardEl } from './dom.js';
import { playQuestion } from '../quiz.js';
import { ACT_NAME } from '../strategy.js';
import { actionKeys, yesNoKeys, playExplain, insExplain, createSession, optionsBox, nextButton, verdict, tableau, handLabel, quickField } from './parts.js';

export function mount(page, app) {
  const st = app.state, data = app.data;
  let ses, focus = st.opts.playFocus || 'mix';
  const canIdx = data.useIdx && data.devs.length > 0;
  if (!canIdx) focus = 'basic';

  const opts = optionsBox('出題の設定',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '出す場面'),
      seg([{ value: 'mix', label: 'まぜる', disabled: !canIdx }, { value: 'dev', label: 'カウントで変わる', disabled: !canIdx }, { value: 'basic', label: '基本戦略' }], focus, v => { focus = v; st.opts.playFocus = v; app.save(); start(); }),
      canIdx ? null : h('span', { class: 'field__hint' }, '条件で「基本戦略だけ」を選んでいるので、カウントで変わる場面は出ません。')),
    quickField(app));

  function start() {
    page.replaceChildren();
    ses = createSession(page, app, { chapter: '第4章', title: '打つ', drill: 'play', extraHead: opts });
    ask();
  }

  function ask() {
    const q = playQuestion(app.rng, { chart: data.chart, devs: data.devs, ins: data.ins, rules: st.rules, useIdx: data.useIdx, focus });
    const after = h('div', { class: 'stack' });
    const tcFact = h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, 'トゥルーカウント'), h('span', { class: 'fact__v' }, signed(q.tc)));
    let keys;
    const no = ses.qno();
    if (q.type === 'ins') {
      const box = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${no}`), tcFact,
        h('div', { class: 'tableau', style: { marginTop: 'var(--space-xs)' } },
          h('div', { class: 'tableau__side' }, h('span', { class: 'fact__k' }, '相手の札'), h('div', { class: 'hand-cards hand-cards--open' }, cardEl(q.upCard, { size: 'md', animate: true }))),
          h('div', { class: 'tableau__side' }, h('span', { class: 'fact__k' }, 'あなたの手'), h('div', { class: 'hand-cards hand-cards--open' }, q.cards.map(c => cardEl(c, { size: 'md', animate: true }))))),
        h('p', { class: 'q__text', style: { marginTop: 'var(--space-sm)' } }, '相手の表はA。保険に入る？'));
      keys = yesNoKeys({ yes: '入る', no: '入らない', onPick: (a) => {
        const ok = a === q.answer; keys.mark(a, q.answer); ses.add(ok ? 'ok' : 'ng');
        after.replaceChildren(verdict(ok ? 'ok' : 'ng', ok ? '正解' : '不正解', `正解は「${q.answer === 'Y' ? '入る' : '入らない'}」`), insExplain(q), next());
        ses.auto(ok, goNext);
      } });
      ses.body.replaceChildren(box, keys.el, after);
      app.sfx.play('deal');
      return;
    }
    const box = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${no}`), tcFact,
      h('div', { style: { marginTop: 'var(--space-xs)' } }, tableau({ upCard: q.upCard, cards: q.cards, info: q.info })),
      h('p', { class: 'q__text', style: { marginTop: 'var(--space-sm)' } }, 'どう打つ？'));
    keys = actionKeys({ can: q.can, rules: st.rules, onPick: (a) => {
      const ok = a === q.answer; keys.mark(a, q.answer); ses.add(ok ? 'ok' : 'ng');
      after.replaceChildren(verdict(ok ? 'ok' : 'ng', ok ? '正解' : '不正解', `${handLabel(q.info)} → ${ACT_NAME[q.answer]}`), playExplain({ ...q, devs: data.devs }), next());
      ses.auto(ok, goNext);
    } });
    ses.body.replaceChildren(box, keys.el, after);
    app.sfx.play('deal');
  }

  const goNext = () => (ses.done() ? finish() : ask());
  const next = () => nextButton(ses.done() ? '採点を見る' : '次の問題', goNext);
  function finish() {
    ses.summary({ onAgain: start });
    ses.body.append(h('p', { class: 'row' }, h('a', { class: 'btn btn--wide', href: '#/charts' }, '打ち方の表を見る（付録B）')));
  }
  start();
}
