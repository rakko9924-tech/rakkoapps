// 広告（Google AdSense）。Web版なので AdMob ではなく AdSense を使う。
//   発行者 pub-1975437480047330（AdMob と共通・siosen323）。rakkoapps.com は ads.txt で所有権確認済み。
//   広告ユニットは、らっこアプリの Web ページで共通のディスプレイ枠（6052222234）を使う（攻略ラボ・NLH と同じ）。
// 出すのは、画面が動かない区切りの場所だけ（目次の下・10問の採点のあと・付録の下）。
//   問題を解いている最中と、中身の高さが変わり続ける実戦の卓には出さない（広告が指の下へ動いてきて誤タップになるため）。
// 自動操作（テスト・検品・試遊AI）と、公開先以外（localhost など）では読み込まない。
//   AdMob と共通のアカウントなので、機械からの表示で不正なトラフィック扱いされないように。
// 審査中・在庫なしで広告が付かないときは、箱ごと隠す（CSS の :has と、data-ad-status の見張り）。
import { h } from './ui/dom.js';

const CONFIG = { client: 'ca-pub-1975437480047330', slot: '6052222234' };
const HOSTS = ['rakkoapps.com', 'www.rakkoapps.com'];

export function adsEnabled() {
  return HOSTS.includes(location.hostname) && !navigator.webdriver;
}

let scriptAdded = false;
function ensureScript() {
  if (scriptAdded) return;
  scriptAdded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CONFIG.client)}`;
  document.head.appendChild(s);
}

// 広告の箱を1つ作る。出さないときは null（h() の子や filter(Boolean) でそのまま捨てられる）
export function adBox() {
  if (!adsEnabled()) return null;
  ensureScript();
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.setAttribute('data-ad-client', CONFIG.client);
  ins.setAttribute('data-ad-slot', CONFIG.slot);
  ins.setAttribute('data-ad-format', 'auto');
  ins.setAttribute('data-full-width-responsive', 'true');
  const box = h('aside', { class: 'ad-box', 'aria-label': '広告' }, h('p', { class: 'ad-box__label' }, '広告'), ins);
  // 埋まらなかったら箱ごと隠す（:has が効かない古いブラウザ向け）
  new MutationObserver(() => { box.hidden = ins.getAttribute('data-ad-status') === 'unfilled'; }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  // ページに入ってから読み込ませる（入る前だと幅0で埋まらない）
  let tries = 0;
  const push = () => {
    if (box.isConnected) { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { box.hidden = true; } return; }
    if (++tries < 20) requestAnimationFrame(push);
  };
  requestAnimationFrame(push);
  return box;
}
