// 付録A 賭け金表と破産リスク
import { h, s, fmt, signed, pts, seg, pageHead } from './dom.js';
import { ramp, metrics, ruinModel, simulatePaths, pctSmart, kellyRaw } from '../betting.js';
import { reachableTcs } from '../quiz.js';
import { kellyName } from '../rules.js';
import { makeRng } from '../cards.js';
import { man, optionsBox } from './parts.js';
import { adBox } from '../ads.js';

const pc = (x, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;

export function mount(page, app) {
  const st = app.state, data = app.data, m = data.money, rows = data.rows;
  let bank = m.bank, horizon = 5000, alive = true, simToken = 0;
  const body = h('div', { class: 'stack' });
  // 広告は作り直す中身（body）の外に1つだけ（資金を切り替えるたびに広告を読み直さない）
  page.append(...[pageHead({ chapter: '付録A', title: '賭け金と破産リスク' }), body, adBox()].filter(Boolean));
  const model = ruinModel(rows, m);

  const bankSeg = () => {
    const need5 = model.bankFor(0.05);
    const opt = [{ value: m.bank, label: 'いまの資金' }, { value: m.bank * 3, label: '3倍' }, { value: m.bank * 10, label: '10倍' }];
    if (need5 && need5 > m.bank * 1.05) opt.push({ value: Math.ceil(need5 / m.step) * m.step, label: '破産5%の額' });
    const el = seg(opt, bank, v => { bank = v; draw(); }, { wrap: true, label: '見たい資金' });
    el.classList.add('seg--wide');
    return el;
  };

  function draw() {
    const rp = ramp(bank, rows, m), mt = metrics(rp);
    const { lo, hi } = reachableTcs(rows, 2e-5);
    const ruin = model.ruinAt(bank), dbl = model.reachBefore(bank, bank * 2);

    // 賭け金表（lo 未満はまとめる）
    const tbody = h('tbody');
    const low = rp.filter(r => r.tc < lo), lf = low.reduce((a, r) => a + r.f, 0);
    if (lf > 0) tbody.append(h('tr', { class: 'is-min' }, h('td', { class: 'hand' }, `${signed(lo - 1)}以下`), h('td', null, `${(lf * 100).toFixed(1)}%`), h('td', null, pc(low.reduce((a, r) => a + r.f * r.e, 0) / lf)), h('td', null, '—'), h('td', { class: 'bet' }, fmt(m.min))));
    for (const r of rp) {
      if (r.tc < lo || r.tc > hi) continue;
      tbody.append(h('tr', { class: r.bet === m.min ? 'is-min' : '' },
        h('td', { class: 'hand' }, signed(r.tc) + (r.tc === rows[rows.length - 1].tc ? '以上' : '')),
        h('td', null, r.f >= 0.001 ? `${(r.f * 100).toFixed(1)}%` : `${(r.f * 100).toFixed(2)}%`),
        h('td', null, pc(r.e)),
        h('td', null, r.e > 0 ? fmt(kellyRaw(bank, r, m.kelly)) : '—'),
        h('td', { class: 'bet' }, fmt(r.bet))));
    }
    const table = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'カウント'), h('th', null, '出る割合'), h('th', null, '優位'), h('th', null, 'ケリー額'), h('th', null, '賭け金'))), tbody);
    // 既定で見せるのは「カウント｜賭け金」だけ（同じ額が続くカウントはまとめる）
    const simple = h('tbody');
    const groups = [];
    for (const r of rp) { if (r.tc > hi) continue; const g = groups[groups.length - 1]; if (g && g.bet === r.bet) g.hi = r.tc; else groups.push({ lo: r.tc, hi: r.tc, bet: r.bet }); }
    groups.forEach((g, i) => {
      const last = i === groups.length - 1, label = i === 0 ? `${signed(g.hi)}以下` : last ? `${signed(g.lo)}以上` : g.lo === g.hi ? signed(g.lo) : `${signed(g.lo)}〜${signed(g.hi)}`;
      simple.append(h('tr', { class: g.bet === m.min ? 'is-min' : '' }, h('td', { class: 'hand' }, label), h('td', { class: 'bet' }, `${fmt(g.bet)}点`)));
    });
    const simpleTable = h('table', { class: 'tbl tbl--simple' }, h('thead', null, h('tr', null, h('th', null, 'トゥルーカウント'), h('th', null, '賭け金'))), simple);

    const stat = (k, v, alert) => h('div', { class: alert ? 'stat stat--alert' : 'stat' }, h('p', { class: 'stat__k' }, k), h('p', { class: 'stat__v' }, v));
    const stats = h('div', { class: 'stats' },
      stat('100ハンドの期待値', [`${mt.mu >= 0 ? '+' : '−'}${fmt(Math.abs(mt.mu * 100))}`, h('small', null, '点')], mt.mu < 0),
      stat('100ハンドの振れ幅（標準偏差）', [`±${fmt(mt.sd * 10)}`, h('small', null, '点')]),
      stat('打ち続けたときの破産リスク', pctSmart(ruin), ruin >= 0.2),
      stat('破産する前に2倍になる確率', pctSmart(dbl)));

    // 結論（表の前に1つ）と、くわしい理由（開いて読む）
    const firstUp = rp.find(r => r.bet > m.min && r.tc <= hi);
    const useBase = !m.hopeless && m.base > m.kelly * bank;
    let lead;
    if (m.hopeless) lead = 'この条件では、最大ベットまで賭けても全体では負けます。有利なカウントで最大ベット、それ以外は最低ベットです。';
    else if (useBase) lead = [`資金 ${man(bank)}点はこの卓には少ないので、賭け金は `, h('b', null, `「資金 約${man(m.base)}点のつもり」`), ` で計算しています。資金が約${man(m.base / m.kelly)}点を超えるまで、この表は変わりません。`];
    else lead = [`資金が十分あるので、`, h('b', null, `${kellyName(m.kelly)}（資金×${m.kelly}）`), ' で計算しています。資金が増えれば、賭け金も増えます。'];
    const small = useBase ? ruinModel(rows, { ...m, base: 0 }).ruinAt(bank) : null;
    const shortTips = [];
    if (useBase) shortTips.push(`ケリー額どおりに小さく賭けると破産リスク ${pctSmart(small)}、この表どおりなら ${pctSmart(ruin)}。`);
    if (firstUp) shortTips.push(`賭け金を上げるのはトゥルーカウント ${signed(firstUp.tc)} から。それより下は最低ベットです。`);
    const tips = [];
    if (m.hopeless) tips.push('有利なカウントで最大ベットを置いても、不利なカウントの最低ベットに削り負けます。最大ベットを上げるか、卓の決まり・深さを見直すと変わります。');
    else if (useBase) {
      tips.push('賭けないことは選べないので、不利なカウントでも最低ベットを置き、そのぶん少しずつ削られます。ケリー額（資金×優位÷振れ幅×倍率）どおりに小さく賭けると、その削られる分を取り返せません。');
      tips.push(`破産リスクが最小になるのは「資金 約${man(m.base)}点のつもり」（正確には ${fmt(m.base)}点ぶん）で賭けるとき。期待値÷分散がいちばん大きくなる大きさで、卓の決まりと最低〜最大ベットだけで決まります。`);
      tips.push(`ケリー額どおりだと破産は遅くなるだけで、打ち続けたときの破産リスクは ${pctSmart(small)}。この賭け方は決着が早くつく代わりに ${pctSmart(ruin)} まで下がります。`);
      tips.push(`資金が ${fmt(Math.ceil(m.base / m.kelly / 1000) * 1000)}点を超えたら、ケリー額どおりに増やしていきます。`);
    } else tips.push(`資金が十分あるので、${kellyName(m.kelly)}の額どおりに賭けます。資金が減れば賭け金も減るので、資金に比例して賭けるあいだは破産しにくくなります。`);
    tips.push(`資金は最低ベットの ${fmt(bank / m.min)}倍。`);

    // 必要な資金
    const needRows = [0.5, 0.2, 0.1, 0.05, 0.01].map(r => { const b = model.bankFor(r); return h('tr', null, h('td', null, `${r * 100}%`), h('td', { class: 'bet' }, b ? fmt(Math.ceil(b / m.step) * m.step) : '—'), h('td', { class: 'tbl__note' }, b ? `最低ベットの ${fmt(b / m.min)}倍` : '届かない')); });
    const need = model.hopeless
      ? h('p', { class: 'err' }, 'この条件では、資金がいくらあっても期待値がプラスになりません。最大ベットを上げるか、卓の決まり・深さを見直してください。')
      : h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '破産リスク'), h('th', null, '必要な資金（点）'), h('th', null, ''))), h('tbody', null, needRows));

    const plot = h('div', { class: 'plot', 'aria-live': 'polite' }, h('p', { class: 'loading' }, '試しています…'));
    const plotInfo = h('div', { class: 'stats' });

    const r0 = st.rules;
    const shortRules = `${r0.decks}デッキ・山の${r0.pen}%まで配る${r0.h17 ? '・H17' : ''}${r0.peek ? '' : '・ホールカードなし'}${r0.ls ? '・サレンダーあり' : ''}${r0.bj65 ? '・BJ 6:5' : ''}`;
    body.replaceChildren(...[
      h('section', { class: 'cond' }, h('p', { class: 'cond__title' }, '条件'), h('p', { class: 'cond__line' }, shortRules),
        h('p', { class: 'cond__line cond__line--sub' }, `ベット ${fmt(m.min)}〜${fmt(m.max)}点・${fmt(m.step)}点刻み・${kellyName(m.kelly)}・${data.useIdx ? 'カウントで打ち方を変える' : '基本戦略だけ'}`)),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, '資金'), bankSeg(), h('p', { class: 'betval', style: { textAlign: 'left' } }, ...pts(bank))),
      h('p', { class: 'leadbox' }, lead),
      h('h2', { class: 'sec' }, 'カウントごとの賭け金'), simpleTable,
      optionsBox('計算の中身を見る（優位・ケリー額）', table,
        h('p', { class: 'note block' }, `優位＝1点賭けたときの平均の儲け。振れ幅＝結果の二乗平均。ケリー額＝資金×優位÷振れ幅×${m.kelly}（${kellyName(m.kelly)}）。賭け金は、ケリー額と「破産リスクが最小になる額」の大きいほうを、最低〜最大ベットに収めて刻みに丸めた額。`)),
      h('h2', { class: 'sec' }, 'この賭け方の成績'), stats,
      shortTips.length ? h('div', { class: 'sol sol--box' }, shortTips.map(t => h('span', { class: 'sol__line' }, t))) : null,
      optionsBox('なぜこの賭け方なの？',h('div', { class: 'sol sol--box' }, tips.map(t => h('span', { class: 'sol__line' }, t)))),
      h('h2', { class: 'sec' }, '必要な資金'), need,
      h('h2', { class: 'sec' }, '資金の動きを試す'),
      seg([{ value: 1000, label: '1,000ハンド' }, { value: 5000, label: '5,000ハンド' }, { value: 20000, label: '20,000ハンド' }], horizon, v => { horizon = v; runSim(plot, plotInfo); }),
      plot, plotInfo,
      h('p', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--small', onclick: () => runSim(plot, plotInfo) }, 'もう一度試す')),
      h('p', { class: 'note block' }, '破産＝資金が最低ベットを下回ること。資金が動くたびに、上の表の考え方で賭け金を決め直しています。乱数で試した一例で、将来の結果を約束するものではありません。'),
      h('p', { class: 'row' }, h('a', { class: 'btn grow', href: '#/settings' }, '条件を変える'), h('a', { class: 'btn btn--primary grow', href: '#/' }, '目次へ戻る'))].filter(Boolean));
    runSim(plot, plotInfo);
  }

  // 少しずつ計算して、画面を止めない
  function runSim(plot, info) {
    const my = ++simToken, total = horizon >= 20000 ? 600 : 1500, chunk = 100, rng = makeRng();
    const kept = [], finals = [];
    let ruined = 0, done = 0;
    plot.replaceChildren(h('p', { class: 'loading' }, '試しています…'));
    const step = () => {
      if (!alive || my !== simToken) return;
      const r = simulatePaths(rows, m, { bank, rounds: horizon, paths: chunk, rng, keep: kept.length < 36 ? 12 : 0, points: 60 });
      kept.push(...r.paths); ruined += r.ruined; for (const f of r.finals) finals.push(f); done += chunk;
      if (done < total) { if (document.hidden) step(); else setTimeout(step, 0); return; }
      finals.sort((a, b) => a - b);
      const q = (x) => finals[Math.min(finals.length - 1, Math.floor(x * finals.length))];
      plot.replaceChildren(pathPlot(kept.slice(0, 36), bank, horizon));
      const stat = (k, v, alert) => h('div', { class: alert ? 'stat stat--alert' : 'stat' }, h('p', { class: 'stat__k' }, k), h('p', { class: 'stat__v' }, v));
      info.replaceChildren(
        stat(`${fmt(horizon)}ハンド以内に破産`, `${Math.round((ruined / total) * 100)}%`, ruined / total >= 0.2),
        stat('終わったときの資金（真ん中）', [fmt(q(0.5)), h('small', null, '点')]),
        stat('悪いほうの5%', [fmt(q(0.05)), h('small', null, '点')]),
        stat('良いほうの5%', [fmt(q(0.95)), h('small', null, '点')]),
        h('p', { class: 'note', style: { gridColumn: '1 / -1' } }, `${fmt(total)}回試して、${fmt(ruined)}回が破産。グラフはそのうち${Math.min(36, kept.length)}回ぶん（太い線が真ん中の1回、赤は破産した回）。`));
    };
    setTimeout(step, 0);
  }

  function pathPlot(paths, start, rounds) {
    const W = 320, H = 190, L = 44, R = 8, T = 10, B = 24;
    let top = start * 1.5;
    for (const p of paths) for (const v of p.pts) if (v > top) top = v;
    const tops = paths.map(p => Math.max(...p.pts)).sort((a, b) => a - b);
    top = Math.max(start * 1.4, tops[Math.floor(tops.length * 0.92)] * 1.05);
    const x = (i, n) => L + (i / Math.max(1, n - 1)) * (W - L - R), y = (v) => T + (1 - Math.min(1, v / top)) * (H - T - B);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `資金の推移を${paths.length}本ぶん描いたグラフ` });
    for (const g of [0.25, 0.5, 0.75, 1]) { const v = top * g; svg.append(s('line', { class: 'plot__grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }), s('text', { class: 'plot__text', x: L - 4, y: y(v) + 3, 'text-anchor': 'end' }, short(v))); }
    svg.append(s('line', { class: 'plot__start', x1: L, x2: W - R, y1: y(start), y2: y(start) }));
    // 真ん中（終わったときの資金が真ん中）の1本だけ太く濃く、ほかは薄く
    const lastOf = (p) => (p.dead ? -1 : p.pts[p.pts.length - 1]);
    const order = paths.map((p, i) => i).sort((a, b) => lastOf(paths[a]) - lastOf(paths[b]));
    const mid = order.length ? order[Math.floor(order.length / 2)] : -1;
    const line = (p, cls) => {
      const n = p.pts.length;
      let d = '';
      for (let i = 0; i < n; i++) { d += `${i ? 'L' : 'M'}${x(i, n).toFixed(1)} ${y(p.pts[i]).toFixed(1)}`; if (p.dead && p.pts[i] <= 0) break; }
      svg.append(s('path', { class: cls, d }));
    };
    paths.forEach((p, i) => { if (i !== mid) line(p, p.dead ? 'plot__path plot__path--dead' : 'plot__path'); });
    if (mid >= 0) line(paths[mid], 'plot__path plot__path--mid');
    svg.append(s('path', { class: 'plot__axis', d: `M${L} ${T} V${H - B} H${W - R}` }),
      s('text', { class: 'plot__text', x: L, y: H - 8 }, '0'), s('text', { class: 'plot__text', x: W - R, y: H - 8, 'text-anchor': 'end' }, `${fmt(rounds)}ハンド`),
      s('text', { class: 'plot__text plot__text--start', x: W - R - 2, y: y(start) - 5, 'text-anchor': 'end' }, 'はじめの資金'));
    return svg;
  }
  const short = (v) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}億` : v >= 1e4 ? `${Math.round(v / 1e4)}万` : fmt(v));

  draw();
  return () => { alive = false; };
}
