// 表紙と目次
import { h, s, fmt, sheet } from './dom.js';
import { describeRulesLong, kellyName } from '../rules.js';
import { todayStats, streakInfo, todayCount, recentDays } from '../store.js';
import { adBox } from '../ads.js';

export const needsData = false;

const CHAPTERS = [
  { group: '練習' },
  { no: '第1章', route: 'count', name: '数える', desc: '流れる札を +1・0・−1 で数える（ランニングカウント）', drill: 'count' },
  { no: '第2章', route: 'tc', name: '割る', desc: '残りデッキで割って、トゥルーカウントに直す', drill: 'tc' },
  { no: '第3章', route: 'bet', name: '賭ける', desc: '資金・カウント・最低〜最大ベットから、賭け金を決める', drill: 'bet' },
  { no: '第4章', route: 'play', name: '打つ', desc: 'カウントで変わるヒット・スタンド・ダブル・スプリット', drill: 'play' },
  { no: '第5章', route: 'mix', name: '総合問題', desc: 'いくら賭けるか → 配られた手をどう打つか、を続けて答える', drill: 'mix' },
  { no: '第6章', route: 'table', name: '実戦', desc: '卓で配られる札を数えながら、賭けて打つ', drill: 'table' },
  { group: '付録' },
  { no: '付録A', route: 'calc', name: '賭け金表と破産リスク', desc: 'カウントごとの賭け金、資金の増え方、必要な資金' },
  { no: '付録B', route: 'charts', name: '基本戦略表とインデックス', desc: 'いまの卓の決まりに合わせた打ち方の表' },
];

// 表紙の図: 札に +1・0・−1 を書き込み、カウントが上がったら賭け金を上げる
const ART = `<svg viewBox="0 0 320 124" role="img" aria-label="札に+1・0・−1を書き込み、カウントに合わせて賭け金を上げる図">
  <g fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.4" stroke-linejoin="round">
    <path d="M18.5 35.6 L55.2 30.4 L62.3 80.5 L25.4 85.9 Z"/>
    <path d="M62.2 28.3 L99.6 28.9 L98.8 79.4 L61.5 78.7 Z"/>
    <path d="M106.4 31.2 L143.1 36.8 L135.6 86.6 L98.9 81.2 Z"/>
  </g>
  <g font-family="var(--font-print)" font-weight="700" font-size="17">
    <text x="27" y="52" fill="var(--color-red-ink)" transform="rotate(-8 27 52)">5</text>
    <text x="67" y="47" fill="var(--color-ink)">K</text>
    <text x="110" y="52" fill="var(--color-red-ink)" transform="rotate(8 110 52)">9</text>
  </g>
  <g font-family="var(--font-hand)" font-weight="600" font-size="15" fill="var(--color-red-ink)">
    <text x="26" y="22">+1</text><text x="70" y="19">−1</text><text x="118" y="24">0</text>
  </g>
  <g fill="none" stroke="var(--color-red)" stroke-width="1.6" stroke-linecap="round">
    <path d="M22 100 C55 104 100 104 139 99"/><path d="M133 95 L140 99 L133 104"/>
  </g>
  <text x="48" y="118" font-family="var(--font-hand)" font-weight="600" font-size="13" fill="var(--color-pencil)">合わせて 0</text>
  <g fill="none" stroke="var(--color-ink)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M178 14 V100.5 H306"/>
  </g>
  <path d="M180 88.5 H232.4 V74.3 H252.5 V58.8 H270.2 V42.1 H286.4 V27.6 H302" fill="none" stroke="var(--color-blue)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M233.5 66.2 C238.7 58.4 250.3 59.6 253.6 67.3 C256.8 75.9 247.5 83.4 239.8 81.7 C232.4 79.9 229.6 72.3 234.2 65.4" fill="none" stroke="var(--color-red)" stroke-width="1.6" stroke-linecap="round"/>
  <g font-family="var(--font-hand)" font-size="12" fill="var(--color-pencil)">
    <text x="186" y="24">賭け金</text><text x="236" y="116">カウント →</text>
    <text x="184" y="83" font-size="11">最低額</text>
  </g>
  <text x="186" y="57" font-family="var(--font-hand)" font-weight="600" font-size="12" fill="var(--color-red-ink)">ここから上げる</text>
</svg>`;

export function mount(page, app) {
  const st = app.state, m = st.money;
  const mark = (c) => {
    if (!c.drill) return '';
    const s = st.stats[c.drill];
    return s && s.n ? `正答 ${s.ok}/${s.n}` : '';
  };
  const art = h('figure', { class: 'cover__art' });
  art.innerHTML = ART;

  const toc = h('nav', { class: 'toc', 'aria-label': '目次' });
  for (const c of CHAPTERS) {
    if (c.group) { toc.append(h('p', { class: 'toc__group' }, c.group)); continue; }
    toc.append(h('a', { class: 'toc__row', href: `#/${c.route}` },
      h('span', { class: 'toc__no' }, c.no), h('span', { class: 'toc__name' }, c.name), h('span', { class: 'toc__mark' }, mark(c)),
      h('span', { class: 'toc__desc' }, c.desc)));
  }

  const cond = h('section', { class: 'cond', style: { marginTop: 'var(--space-lg)' } },
    h('p', { class: 'cond__title' }, 'いまの条件'),
    h('p', { class: 'cond__line' }, `資金 ${fmt(m.bank)}点・ベット ${fmt(m.min)}〜${fmt(m.max)}点`),
    h('p', { class: 'cond__line cond__line--sub' }, describeRulesLong(st.rules)),
    h('p', { class: 'cond__line cond__line--sub' }, `賭け方: ${kellyName(m.kelly)}（資金が少ないあいだは、破産リスクが最小になる賭け方）・${st.strat === 'ix' ? 'カウントで打ち方を変える' : '基本戦略だけで打つ'}`),
    h('p', { class: 'row', style: { marginTop: 'var(--space-xs)' } }, h('a', { class: 'btn btn--small', href: '#/settings' }, '条件を変える')));

  const today = todayBlock(st);

  const foot = h('footer', { class: 'foot' },
    h('a', { class: 'foot__rakko', href: 'https://rakkoapps.com/', rel: 'noopener' }, h('img', { src: 'assets/rakko.png', alt: '', width: 32, height: 32, loading: 'lazy' }), 'らっこアプリ｜ほかのアプリを見る'),
    h('div', { class: 'foot__links' },
      h('button', { type: 'button', onclick: () => window.RakkoContact && window.RakkoContact.openContact() }, '問い合わせ'),
      h('button', { type: 'button', onclick: () => sheet('この練習帳について', aboutBody()) }, 'この練習帳について'),
      h('a', { href: 'privacy.html' }, 'プライバシーポリシー')),
    h('p', { class: 'foot__small' }, '計算と判断を練習するための問題集です。お金のやり取りはありません。'));

  page.classList.add('reveal');
  const parts = [
    h('header', { class: 'cover' },
      h('div', { class: 'cover__top' },
        h('div', null, h('h1', { class: 'cover__title' }, 'カウンティング', h('br'), '練習帳'), h('p', { class: 'cover__sub' }, 'ブラックジャック｜数える・割る・賭ける・打つ')),
        h('img', { class: 'cover__pic', src: 'assets/cover.jpg', alt: '', width: 180, height: 180 }))),
    art, today, toc, cond, adBox(), foot,
  ].filter(Boolean);
  parts.forEach((p, i) => p.style.setProperty('--i', i));
  page.append(...parts);
  return () => page.classList.remove('reveal');
}

// 今日のメニュー: 日替わりで3つ。3日で全部の章に一度は触れる回し方
const MENUS = [
  [{ drill: 'count', name: '数える', n: 1, unit: '回' }, { drill: 'tc', name: '割る', n: 5, unit: '問' }, { drill: 'bet', name: '賭ける', n: 5, unit: '問' }],
  [{ drill: 'count', name: '数える', n: 1, unit: '回' }, { drill: 'play', name: '打つ', n: 5, unit: '問' }, { drill: 'mix', name: '総合問題', n: 3, unit: '問' }],
  [{ drill: 'count', name: '数える', n: 1, unit: '回' }, { drill: 'tc', name: '割る', n: 5, unit: '問' }, { drill: 'table', name: '実戦', n: 10, unit: '手' }],
];
const md = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;

// 今日の練習: 続けた日数・今日のメニュー・この2週間
function todayBlock(st) {
  const now = new Date();
  const dayNo = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  const menu = MENUS[dayNo % MENUS.length];
  const td = todayStats(st), si = streakInfo(st);
  let head;
  if (td) head = `今日 ${td.n}問・正答 ${Math.round((td.ok / td.n) * 100)}%${si.cur >= 2 ? `｜${si.cur}日続けて練習中` : ''}`;
  else if (si.cur >= 1) head = `昨日まで ${si.cur}日続けて練習。今日も1つやると ${si.cur + 1}日目`;
  else if (si.last) head = `前回は${md(si.last)}（${si.daysAgo}日前）。今日からまた1日目`;
  else head = '今日のメニューから始めましょう';
  const items = menu.map((it) => {
    const got = todayCount(st, it.drill), done = got >= it.n;
    return h('a', { class: done ? 'menu__item is-done' : 'menu__item', href: `#/${it.drill}`, 'aria-label': `${it.name} ${it.n}${it.unit}${done ? '（できた）' : ''}` },
      s('svg', { class: 'menu__mark', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, done ? s('path', { d: 'M12.5 3.5 C7 3 3.4 7 3.6 12 C3.8 17 7.6 20.6 12.4 20.4 C17.4 20.2 20.6 16.4 20.4 11.6 C20.2 7.2 17 3.6 11 4.2', pathLength: '1' }) : s('circle', { cx: 12, cy: 12, r: 8.5 })),
      h('span', { class: 'menu__name' }, it.name),
      h('span', { class: 'menu__n' }, done ? `${it.n}${it.unit} できた` : `${Math.min(got, it.n)} / ${it.n}${it.unit}`));
  });
  const allDone = menu.every(it => todayCount(st, it.drill) >= it.n);
  const days = recentDays(st, 14), sumN = days.reduce((a, d) => a + d.n, 0), sumOk = days.reduce((a, d) => a + d.ok, 0);
  return h('section', { class: 'todayblk', 'aria-label': '今日の練習' },
    h('p', { class: 'today' }, head),
    si.best >= 2 ? h('p', { class: 'note' }, `いちばん長く続いたのは ${si.best}日`) : null,
    h('p', { class: 'menu__title' }, '今日のメニュー'),
    h('div', { class: 'menu' }, items),
    allDone ? h('p', { class: 'note menu__done' }, '今日のメニューは全部できました。ポーカーの道具もあります: ',
      h('a', { href: 'https://rakkoapps.com/apps/PokerEquityCalc/', rel: 'noopener' }, '勝率計算'), '・',
      h('a', { href: 'https://rakkoapps.com/apps/icm-deal/', rel: 'noopener' }, 'ディール計算機')) : null,
    sumN ? h('div', { class: 'week' }, weekBars(days), h('p', { class: 'note' }, `この2週間: ${sumN}問・正答 ${Math.round((sumOk / sumN) * 100)}%`)) : null);
}

// この2週間の問題数（今日は赤）
function weekBars(days) {
  const W = 320, H = 70, B = 52, gap = 4, bw = (W - gap * (days.length - 1)) / days.length;
  const max = Math.max(5, ...days.map(d => d.n));
  const svg = s('svg', { class: 'week__svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `この2週間の問題数: ${days.map(d => `${md(d.date)} ${d.n}問`).join('、')}` });
  svg.append(s('line', { class: 'week__base', x1: 0, x2: W, y1: B, y2: B }));
  days.forEach((d, i) => {
    const x = i * (bw + gap), hgt = d.n ? Math.max(3, (d.n / max) * (B - 6)) : 0, isToday = i === days.length - 1;
    if (hgt) svg.append(s('rect', { class: isToday ? 'week__bar is-today' : 'week__bar', x, y: B - hgt, width: bw, height: hgt, rx: 1.5 }));
  });
  const lab = (i, t, anchor) => svg.append(s('text', { class: 'week__text', x: i * (bw + gap) + (anchor === 'end' ? bw : 0), y: H - 2, 'text-anchor': anchor }, t));
  lab(0, `${days[0].date.getMonth() + 1}/${days[0].date.getDate()}`, 'start');
  lab(days.length - 1, '今日', 'end');
  return svg;
}

function aboutBody() {
  return h('div', { class: 'stack' },
    h('p', { class: 'note' }, 'カウントごとの優位と出現率は、卓の決まりごとに数億〜10億ハンドを配って集計した値です。賭け金はケリー基準（資金×優位÷結果の二乗平均）が土台です。賭けないことは選べない前提なので、資金が少ないあいだは「破産リスクが最小になる賭け方」を下回らないようにしています。'),
    h('p', { class: 'note' }, '破産リスクは、資金が最低ベットを下回ることを破産として、その賭け方で打ち続けたときの確率です。将来の結果を約束するものではありません。'),
    h('p', { class: 'note' }, 'カウンティングを断る店もあります。遊ぶ場所の決まりと法律を守ってください。'),
    h('p', { class: 'note' }, '広告は Google AdSense を使っています。成績や設定はこの端末の中だけに保存します（問い合わせを送ったときだけ、その文といまの条件を送ります）。くわしくは ', h('a', { href: 'privacy.html' }, 'プライバシーポリシー'), '。'),
    h('p', { class: 'note' }, '効果音: Kenney（CC0）'));
}
