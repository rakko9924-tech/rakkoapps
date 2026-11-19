// 入口: 画面の切り替えと、条件に合った表の読み込み
import { load, save, record } from './store.js';
import { loadRuleData } from './data.js';
import { ruleKey } from './rules.js';
import { decodeTable, withBase } from './betting.js';
import { makeRng } from './cards.js';
import { h } from './ui/dom.js';
import * as sfx from './sfx.js';
import * as home from './ui/home.js';
import * as settings from './ui/settings.js';
import * as count from './ui/count.js';
import * as tc from './ui/tc.js';
import * as bet from './ui/bet.js';
import * as play from './ui/play.js';
import * as mix from './ui/mix.js';
import * as calc from './ui/calc.js';
import * as charts from './ui/charts.js';
import * as table from './ui/table.js';

export const APP_ID = 'bj-count';
export const APP_VER = '1.0.0';
const SCREENS = { '': home, settings, count, tc, bet, play, mix, calc, charts, table };
const TITLES = { '': '', settings: '条件', count: '数える', tc: '割る', bet: '賭ける', play: '打つ', mix: '総合問題', calc: '賭け金表と破産リスク', charts: '基本戦略表', table: '実戦' };
const SITE = 'カウンティング練習帳｜ブラックジャック';

const app = {
  state: load(),
  rng: makeRng(),
  data: null,
  sfx,
  save() { save(this.state); },
  record(drill, ok, n = 1) { record(this.state, drill, ok, n); },
  go(route) { location.hash = `#/${route}`; },
  // 文字の大きさ（条件の「文字の大きさ」）
  applyTextSize() { document.documentElement.classList.toggle('big-text', !!this.state.opts.bigText); },
  // いまの条件に合う表（基本戦略・カウント別の期待値・インデックス）を用意する
  async ensureData() {
    const st = this.state, key = ruleKey(st.rules);
    const sig = `${key}|${st.rules.pen}|${st.rules.bj65}|${st.strat}`;
    if (this.data && this.data.sig === sig) { this.data.money = withBase(this.data.rows, st.money); return this.data; }
    const { chart, table: tbl } = await loadRuleData(key);
    if (!chart || !tbl) throw new Error('この条件の表がまだありません');
    const useIx = st.strat === 'ix' && !!tbl.ix;
    this.data = {
      sig, key, chart, table: tbl, useIdx: useIx,
      rows: decodeTable(tbl, useIx ? 'ix' : 'bs', st.rules.pen, st.rules.bj65),
      devs: useIx ? tbl.devs : [],
      ins: useIx ? tbl.ins : 99,
    };
    // 賭け金の計算に使うお金の条件（その卓で破産リスクが最小になる「基準の資金」つき）
    this.data.money = withBase(this.data.rows, st.money);
    return this.data;
  },
};
sfx.setEnabled(app.state.opts.sound);
app.applyTextSize();

// 問い合わせ欄（共通部品）。そのときの条件だけを添える（個人を特定する値は入れない）
const CONTACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzQ3J59oxKKDhUHLEkj6Jw27b3via1Nazd7rHjYsySh75W6Jxs7nCI7DZBLqKZVa3vn/exec';
if (window.RakkoContact) {
  window.RakkoContact.init({
    app: APP_ID,
    endpoint: CONTACT_ENDPOINT,
    getState: () => {
      const st = app.state, m = st.money;
      return { ver: APP_VER, rules: `${ruleKey(st.rules)} pen${st.rules.pen}${st.rules.bj65 ? ' bj65' : ''}`, money: `bank${m.bank} min${m.min} max${m.max} step${m.step} k${m.kelly}`, strat: st.strat, page: location.hash.slice(0, 40) };
    },
    texts: { contactPh: '例: 賭け金の答えがおかしい場面があった', rakko: 'らっこアプリ｜ほかのアプリを見る' },
  });
  // Esc で閉じる
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.rkc-wrap:not([hidden])').forEach((w) => { w.hidden = true; }); });
}
// 自動操作（検品ツールなど）からは、問い合わせの受け口へ本当には送らない
if (navigator.webdriver) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opt) => (String(url).startsWith(CONTACT_ENDPOINT) ? Promise.resolve(new Response('')) : realFetch(url, opt));
}

const root = document.getElementById('app');
let cleanup = null, token = 0;

// 画面を切り替えた直後の2度押し対策（2発目が次の画面のボタンに当たるのを防ぐ）
//  - 切り替えから 250ms は何も押せない（.page.is-guard）
//  - さらに 700ms までは「画面を切り替えたリンクのタップと同じ場所」への2度目だけを捨てる。違う場所を素早く押すのは通す
//    （覚えるのはリンクのタップだけ。ボタンの直後にURLで移った時などに、関係ない場所を捨てないため）
let linkTap = null, navTap = null;
const sameSpot = (e) => navTap && performance.now() - navTap.t < 700 && Math.hypot(e.clientX - navTap.x, e.clientY - navTap.y) < 40;
for (const type of ['pointerdown', 'click']) document.addEventListener(type, (e) => { if (sameSpot(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || (!e.clientX && !e.clientY)) return; // キーボードや合成のクリックは位置が無い
  if (e.target instanceof Element && e.target.closest('a[href^="#"]')) linkTap = { t: performance.now(), x: e.clientX, y: e.clientY };
}, true);

// 柱（目次・条件）: 指で上へ戻したときだけ画面の上に貼りつける。下へ読み進めるあいだと、
// プログラムで送ったとき（答え合わせで下へ送る等）は貼りつけず、中身を覆わない
let lastY = 0, userAt = -1e9;
const markUser = () => { userAt = performance.now(); };
addEventListener('touchmove', markUser, { passive: true });
addEventListener('wheel', markUser, { passive: true });
addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) markUser(); });
addEventListener('scroll', () => {
  const y = scrollY, dy = y - lastY; lastY = y;
  const cl = document.documentElement.classList;
  if (y < 60) { cl.remove('head-pinned'); return; }
  if (performance.now() - userAt > 600) return;
  if (dy < -4) cl.add('head-pinned'); else if (dy > 4) cl.remove('head-pinned');
}, { passive: true });

async function render() {
  const route = location.hash.replace(/^#\/?/, '').split('?')[0];
  const name = Object.hasOwn(SCREENS, route) ? route : '';
  const mod = SCREENS[name];
  const my = ++token;
  if (cleanup) { try { cleanup(); } catch { /* 片づけの失敗で次の画面を止めない */ } cleanup = null; }
  const page = h('main', { class: 'page is-guard', id: 'page' });
  setTimeout(() => page.classList.remove('is-guard'), 250);
  navTap = linkTap && performance.now() - linkTap.t < 500 ? { t: performance.now(), x: linkTap.x, y: linkTap.y } : null;
  linkTap = null;
  root.replaceChildren(page);
  window.scrollTo(0, 0);
  document.documentElement.classList.remove('head-pinned');
  document.title = TITLES[name] ? `${TITLES[name]}｜${SITE}` : SITE;
  try {
    if (mod.needsData !== false) {
      page.append(h('p', { class: 'loading' }, '表を読み込んでいます…'));
      await app.ensureData();
      if (my !== token) return;
      page.replaceChildren();
    }
    cleanup = mod.mount(page, app) || null;
  } catch (e) {
    if (my !== token) return;
    console.error(e);
    page.replaceChildren(
      h('header', { class: 'head' }, h('a', { class: 'head__back', href: '#/' }, '目次'), h('h1', { class: 'head__title' }, '読み込めませんでした'), h('span')),
      h('p', { class: 'err' }, '表を読み込めませんでした。通信の状態を確かめて、もう一度開いてください。'),
      h('p', { class: 'row', style: { marginTop: '1rem' } }, h('button', { class: 'btn', type: 'button', onclick: () => render() }, 'もう一度読み込む')));
  }
}
window.addEventListener('hashchange', render);
render();
