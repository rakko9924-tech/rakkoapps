// 付録B 基本戦略表とインデックス
import { h, signed, pageHead } from './dom.js';
import { chartCell, UP_ORDER, upLabel, devText } from '../strategy.js';
import { describeRulesLong } from '../rules.js';
import { adBox } from '../ads.js';

export function mount(page, app) {
  const st = app.state, data = app.data, ch = data.chart;
  const devCells = new Set(data.devs.map(d => `${d.kind}|${d.total}|${d.up}`));
  const head = () => h('thead', null, h('tr', null, h('th', null, ''), UP_ORDER.map(u => h('th', { scope: 'col' }, upLabel(u)))));
  const row = (label, kind, key, devKind) => h('tr', null, h('th', { scope: 'row' }, label),
    UP_ORDER.map(u => { const a = chartCell(ch, kind, key, u); return h('td', { 'data-a': a, class: devCells.has(`${devKind}|${key}|${u}`) ? 'is-dev' : '' }, a); }));
  const hard = h('table', { class: 'chart' }, h('caption', { class: 'chart__cap' }, 'ハード（Aを11に数えない手）'), head(), h('tbody', null,
    h('tr', null, h('th', { scope: 'row' }, '8以下'), UP_ORDER.map(u => { const a = chartCell(ch, 'hard', 8, u); return h('td', { 'data-a': a }, a); })),
    [9, 10, 11, 12, 13, 14, 15, 16].map(t => row(String(t), 'hard', t, 'H')),
    h('tr', null, h('th', { scope: 'row' }, '17以上'), UP_ORDER.map(u => { const a = chartCell(ch, 'hard', 17, u); return h('td', { 'data-a': a }, a); }))));
  const soft = h('table', { class: 'chart' }, h('caption', { class: 'chart__cap' }, 'ソフト（Aを11に数える手）'), head(), h('tbody', null, [13, 14, 15, 16, 17, 18, 19, 20].map(t => row(`A,${t - 11}`, 'soft', t, 'S'))));
  const pair = h('table', { class: 'chart' }, h('caption', { class: 'chart__cap' }, 'ペア'), head(), h('tbody', null, [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map(p => row(p === 1 ? 'A,A' : `${p},${p}`, 'pair', p, 'P'))));

  const used = new Set();
  for (const t of [hard, soft, pair]) t.querySelectorAll('td').forEach(td => used.add(td.dataset.a));
  const LEG = [['H', 'ヒット'], ['S', 'スタンド'], ['D', 'ダブル（できなければヒット）'], ['Ds', 'ダブル（できなければスタンド）'], ['P', 'スプリット'], ['R', 'サレンダー（できなければヒット）'], ['Rs', 'サレンダー（できなければスタンド）'], ['Rp', 'サレンダー（できなければスプリット）']];
  const legend = h('div', { class: 'legend block' }, LEG.filter(([a]) => used.has(a)).map(([a, name]) => h('span', null, h('i', { class: 'chart-swatch', 'data-a': a }), `${a} ${name}`)),
    data.devs.length ? h('span', null, h('i', { class: 'chart-swatch chart-swatch--dev' }), '赤枠 カウントで変わる（下に一覧）') : null);

  const devList = data.devs.length
    ? h('ul', { class: 'sol' }, data.devs.map(d => h('li', { class: 'sol__line' }, devText(d))), data.ins < 50 ? h('li', { class: 'sol__line' }, `保険：${signed(data.ins)} 以上で入る、未満は入らない`) : null)
    : h('p', { class: 'note block' }, '条件で「基本戦略だけ」を選んでいます。カウントで打ち方を変える場面は使いません。');

  page.append(...[pageHead({ chapter: '付録B', title: '基本戦略表' }),
    h('div', { class: 'stack' },
      h('section', { class: 'cond' }, h('p', { class: 'cond__title' }, 'この卓の決まり'), h('p', { class: 'cond__line cond__line--sub' }, describeRulesLong(st.rules))),
      h('p', { class: 'note block' }, '縦が自分の手、横が相手の表の札。この卓の決まりで、各行動の期待値を計算して作った表です。'),
      legend, hard, soft, pair,
      h('h2', { class: 'sec' }, 'カウントで変わる場面'),
      data.devs.length ? h('p', { class: 'note block' }, '赤枠のマスは、トゥルーカウントで行動が変わります。数字はこの卓の決まりで配って確かめた値です。') : null,
      devList,
      h('p', { class: 'row' }, h('a', { class: 'btn grow', href: '#/play' }, '第4章で練習する'), h('a', { class: 'btn btn--primary grow', href: '#/' }, '目次へ戻る'))),
    adBox()].filter(Boolean));
}
