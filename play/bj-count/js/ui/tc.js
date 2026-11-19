// 第2章 割る — ランニングカウントを残りデッキで割って、トゥルーカウントに直す
import { h, signed, seg, numberPad, trayFig, verdict, pageHead } from './dom.js';
import { tcQuestion } from '../quiz.js';
import { createSession, optionsBox, nextButton, quickField, howTo } from './parts.js';

export const needsData = false;

// やり方の例（デッキ数ごと）: 捨て札・残り・ランニングカウント
const EXAMPLE = { 1: [0.25, 0.75, 2], 2: [0.5, 1.5, 4], 6: [2, 4, 6], 8: [3, 5, 8] };
const dec = (x) => (Number.isInteger(x) ? signed(x) : x.toFixed(2).replace(/0$/, '').replace('-', '−'));

export function mount(page, app) {
  const st = app.state;
  let ses, pad = null, prev = null;
  const opts = optionsBox('出題の設定',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '残りデッキ'),
      seg([{ value: false, label: '図から読む' }, { value: true, label: '数字も出す' }], !!st.opts.tcShowDecks, v => { st.opts.tcShowDecks = v; app.save(); start(); })),
    quickField(app));

  function intro() {
    const d = st.rules.decks, [dealt, left, rc] = EXAMPLE[d] || EXAMPLE[6], ex = rc / left;
    page.replaceChildren(pageHead({ chapter: '第2章', title: '割る' }), opts,
      h('div', { class: 'stack' },
        howTo(
          h('ol', { class: 'howto__steps' },
            h('li', null, '① 捨て札置き場の高さを読む。置き場には、もう配り終えた札がたまっています'),
            h('li', null, `② 残りのデッキ数 ＝ ${d} − 捨て札`),
            h('li', null, '③ ランニングカウント ÷ 残りのデッキ数 ＝ トゥルーカウント。端数は切り下げます（+1.5 → +1、−1.5 → −2）')),
          trayFig(d, dealt, { showNumbers: true }),
          h('p', { class: 'sol sol__line--calc' }, `例: 捨て札 ${dealt}デッキ → 残り ${d} − ${dealt} ＝ ${left}デッキ。+${rc} ÷ ${left} ＝ ${dec(ex)} → 切り下げて ${signed(Math.floor(ex))}`)),
        h('button', { type: 'button', class: 'btn btn--primary btn--wide', onclick: start }, '始める')));
  }

  function start() {
    if (pad) { pad.destroy(); pad = null; }
    page.replaceChildren();
    ses = createSession(page, app, { chapter: '第2章', title: '割る', drill: 'tc', extraHead: opts });
    ask();
  }

  const goNext = () => (ses.done() ? ses.summary({ onAgain: start }) : ask());

  function ask() {
    if (pad) { pad.destroy(); pad = null; }
    const q = tcQuestion(app.rng, { decks: st.rules.decks, pen: st.rules.pen, prev });
    prev = q;
    const after = h('div', { class: 'stack' });
    const box = h('section', { class: 'q' }, h('span', { class: 'q__no' }, `問${ses.qno()}`),
      h('div', { class: 'facts' },
        h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, 'ランニングカウント'), h('span', { class: 'fact__v' }, signed(q.rc))),
        st.opts.tcShowDecks ? h('div', { class: 'fact fact--key' }, h('span', { class: 'fact__k' }, '残りデッキ'), h('span', { class: 'fact__v' }, String(q.decksLeft))) : null),
      trayFig(q.decks, q.decksDealt),
      h('p', { class: 'q__text' }, 'トゥルーカウントは？'),
      h('p', { class: 'q__sub' }, `残り ＝ ${q.decks} − 捨て札。ランニングカウントを残りで割り、端数は切り下げ（小さい方へ）`));
    pad = numberPad({ onSubmit: (v) => {
      pad.lock();
      pad.el.hidden = true; // 答えたらテンキーは畳む
      const ok = v === q.answer;
      ses.add(ok ? 'ok' : 'ng');
      const exact = q.rc / q.decksLeft;
      after.replaceChildren(
        verdict(ok ? 'ok' : 'ng', ok ? '正解' : '不正解', `トゥルーカウントは ${signed(q.answer)}（あなたは ${signed(v)}）`),
        h('div', { class: 'sol' },
          h('span', { class: 'sol__line' }, `捨て札 ${q.decksDealt}デッキ → 残り ${q.decks} − ${q.decksDealt} ＝ `, h('b', null, `${q.decksLeft}デッキ`)),
          h('span', { class: 'sol__line' }, `${signed(q.rc)} ÷ ${q.decksLeft} ＝ ${Number.isInteger(exact) ? signed(exact) : exact.toFixed(2).replace('-', '−')}`, Number.isInteger(exact) ? '' : ' → 切り下げて ', h('span', { class: 'ans' }, Number.isInteger(exact) ? '' : signed(q.answer))),
          q.rc < 0 && !Number.isInteger(exact) ? h('span', { class: 'sol__line' }, 'マイナスの端数は、より小さい数へ（賭けすぎない側に倒す）') : null),
        nextButton(ses.done() ? '採点を見る' : '次の問題', goNext));
      ses.auto(ok, goNext);
    } });
    ses.body.replaceChildren(box, pad.el, after);
  }

  intro();
  return () => { if (pad) pad.destroy(); };
}
