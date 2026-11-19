// 第1章 数える — 流れる札を +1・0・−1 で数える（ランニングカウント）
import { h, signed, seg, cardEl, pageHead, numberPad, verdict } from './dom.js';
import { countQuestion } from '../quiz.js';
import { countKey, recordCount, countStats, fastestCount } from '../store.js';
import { optionsBox, nextButton } from './parts.js';

export const needsData = false;

// 速さ（遅い順）。0 は「自分でめくる」（押すたびに次の札）
const TIMED = [{ value: 2000, label: 'とてもゆっくり' }, { value: 1200, label: 'ゆっくり' }, { value: 800, label: 'ふつう' }, { value: 500, label: '速い' }, { value: 300, label: '最速' }];
const SPEEDS = [...TIMED, { value: 0, label: '自分でめくる' }];
const SIZES = [{ value: 10, label: '10枚' }, { value: 20, label: '20枚' }, { value: 30, label: '30枚' }, { value: 52, label: '52枚' }];
const GROUPS = [{ value: 1, label: '1枚ずつ' }, { value: 2, label: '2枚ずつ' }, { value: 3, label: '3枚ずつ' }];
const nameOf = (list, v) => (list.find(x => x.value === v) || list[0]).label;
const sec = (ms) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)}秒`;

export function mount(page, app) {
  const st = app.state, o = st.opts;
  if (!SPEEDS.some(x => x.value === o.countSpeed)) o.countSpeed = 800;
  let timer = null, pad = null, alive = true;
  const body = h('div', { class: 'stack' });
  const opts = optionsBox('枚数と出し方',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '枚数'), seg(SIZES, o.countCards, v => { o.countCards = v; app.save(); intro(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '出し方'), seg(GROUPS, o.countGroup, v => { o.countGroup = v; app.save(); intro(); }),
      h('span', { class: 'field__hint' }, '2枚ずつにすると、10と5のように打ち消し合う組をまとめて 0 と見る練習になります。')));
  page.append(pageHead({ chapter: '第1章', title: '数える' }), opts, body);

  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } if (pad) { pad.destroy(); pad = null; } };
  const setting = () => `${o.countCards}枚・${nameOf(SPEEDS, o.countSpeed)}・${nameOf(GROUPS, o.countGroup)}`;

  function records() {
    const s = countStats(st, countKey(o)), f = fastestCount(st), lines = [];
    lines.push(s.n ? `この設定の成績: ${s.n}回中 ${s.ok}回 正解` : 'この設定はまだ記録がありません');
    if (f) lines.push(`いちばん速く正解できたのは 1枚 ${sec(f.per)}（${f.cards}枚・${nameOf(SPEEDS, f.speed)}・${nameOf(GROUPS, f.group)}）`);
    return lines.map(t => h('p', { class: 'q__sub' }, t));
  }

  function intro() {
    stop();
    const legend = h('div', { class: 'legendrow' },
      h('div', null, h('div', { class: 'hand-cards hand-cards--open' }, cardEl(1 + 13 * 1, { size: 'sm' }), cardEl(5 + 13 * 3, { size: 'sm' })), h('span', { class: 'legendrow__k' }, '2〜6'), h('span', { class: 'hand red legendrow__v' }, '+1')),
      h('div', null, h('div', { class: 'hand-cards hand-cards--open' }, cardEl(6, { size: 'sm' }), cardEl(8 + 13 * 2, { size: 'sm' })), h('span', { class: 'legendrow__k' }, '7〜9'), h('span', { class: 'hand red legendrow__v' }, '0')),
      h('div', null, h('div', { class: 'hand-cards hand-cards--open' }, cardEl(12 + 13 * 1, { size: 'sm' }), cardEl(0 + 13 * 3, { size: 'sm' })), h('span', { class: 'legendrow__k' }, '10・絵札・A'), h('span', { class: 'hand red legendrow__v' }, '−1')));
    const start = h('button', { type: 'button', class: 'btn btn--primary btn--wide', onclick: run }, '始める');
    body.replaceChildren(
      h('section', { class: 'q' }, h('span', { class: 'q__no' }, 'やり方'),
        h('p', { class: 'q__text' }, '札が順に出ます。足し引きしながら数え、最後の数を答えます。'), legend,
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, '速さ'), seg(SPEEDS, o.countSpeed, v => { o.countSpeed = v; app.save(); intro(); }, { wrap: true })),
        h('p', { class: 'q__sub', style: { marginTop: 'var(--space-xs)' } }, `いまの設定: ${setting()}`),
        ...records()),
      start);
  }

  function run() {
    stop();
    const q = countQuestion(app.rng, { decks: st.rules.decks, cards: o.countCards, group: o.countGroup });
    const manual = o.countSpeed === 0;
    const cards = h('div', { class: 'stage__cards' });
    const left = h('p', { class: 'stage__count', 'aria-live': 'off' });
    const quit = h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: intro }, 'やめる');
    const nextCard = manual ? h('button', { type: 'button', class: 'btn btn--primary grow', onclick: () => step() }, '次の札') : null;
    const stage = h('section', { class: 'stage', 'aria-label': '札が出る場所', onclick: manual ? (e) => { if (e.target === stage || stage.contains(e.target)) step(); } : null }, cards, left);
    body.replaceChildren(stage, h('div', { class: 'row row--end' }, nextCard, quit));
    // 次の札の前に一瞬だけ何も出さない＋左右へ少しずらして置く（同じ札が続いても、替わったと分かるように）
    const gap = Math.round(Math.max(90, Math.min(160, o.countSpeed * 0.2)));
    let i = 0;
    function step() {
      if (!alive) return;
      if (timer) { clearTimeout(timer); timer = null; }
      if (i >= q.groups.length) { cards.replaceChildren(); left.textContent = ''; if (nextCard) nextCard.disabled = true; timer = setTimeout(() => ask(q), manual ? 0 : 150); return; }
      cards.style.transform = i % 2 ? 'translateX(12px) rotate(3deg)' : 'translateX(-12px) rotate(-3deg)';
      cards.replaceChildren(...q.groups[i].map(id => cardEl(id, { size: 'lg', animate: true })));
      left.textContent = `${Math.min(q.ids.length, (i + 1) * o.countGroup)} / ${q.ids.length} 枚`;
      app.sfx.play('tick');
      i++;
      if (manual) { if (nextCard) nextCard.textContent = i >= q.groups.length ? '答える' : '次の札'; return; }
      timer = setTimeout(() => { if (!alive) return; cards.replaceChildren(); timer = setTimeout(step, gap); }, o.countSpeed - gap);
    }
    timer = setTimeout(step, 500);
  }

  function ask(q) {
    const after = h('div', { class: 'stack' });
    const t0 = performance.now();
    pad = numberPad({ onSubmit: (v) => {
      pad.lock();
      pad.el.hidden = true; // 答えたらテンキーは畳む（答えと振り返りをその場所に出す）
      const ok = v === q.answer, ms = performance.now() - t0;
      app.record('count', ok ? 1 : 0); recordCount(st, countKey(o), ok); app.sfx.play(ok ? 'ok' : 'ng');
      const s = countStats(st, countKey(o));
      // 正解なら1段速く、まちがえたら1段ゆっくり、をすぐ選べるように
      const k = TIMED.findIndex(x => x.value === o.countSpeed);
      const shift = ok ? (k >= 0 && k < TIMED.length - 1 ? TIMED[k + 1] : null) : (k > 0 ? TIMED[k - 1] : null);
      const again = (sp) => () => { if (sp) { o.countSpeed = sp.value; app.save(); } run(); };
      after.replaceChildren(...[
        verdict(ok ? 'ok' : 'ng', ok ? '正解' : '不正解', `ランニングカウントは ${signed(q.answer)}（あなたは ${signed(v)}）・答えるまで ${sec(ms)}`),
        h('p', { class: 'note block' }, `この設定（${setting()}）の成績: ${s.n}回中 ${s.ok}回 正解`),
        h('p', { class: 'note block' }, '出た札と、その時点までの合計'),
        h('div', { class: 'review' }, q.ids.map((id, k2) => { const c = cardEl(id, { size: 'sm' }); c.append(h('span', { class: 'card__tag' }, signed(q.running[k2]))); return c; })),
        shift ? nextButton(`${ok ? '1段速く' : '1段ゆっくり'}してもう一度（${shift.label}）`, again(shift)) : null,
        shift ? h('button', { type: 'button', class: 'btn btn--wide', onclick: again(null) }, '同じ速さでもう一度') : nextButton('もう一度', again(null)),
        h('div', { class: 'row' }, h('a', { class: 'btn grow', href: '#/' }, '目次へ'), h('a', { class: 'btn grow', href: '#/tc' }, '第2章 割るへ'))].filter(Boolean));
    } });
    body.replaceChildren(h('section', { class: 'q' }, h('span', { class: 'q__no' }, '答え'), h('p', { class: 'q__text' }, 'ランニングカウントは？')), pad.el, after);
  }

  intro();
  return () => { alive = false; stop(); };
}
