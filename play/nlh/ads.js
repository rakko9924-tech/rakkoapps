/* ads.js — Web版の広告（Google AdSense）
   AdMob はアプリ専用でWebページには使えないため、Web版の収益化は AdSense を使う。

   ▼ 有効化の手順（ユーザー作業が必要）
     1. AdSense に rakkoapps.com をサイト登録し、審査を通す
     2. サイト直下に ads.txt を置く（rakko-apps-site/ads.txt）
     3. 「ディスプレイ広告」ユニットを1つ作り、発行者IDとスロットIDを下の CONFIG に入れる
     4. CONFIG.enabled を true にして再デプロイ
   審査前・未設定のあいだは広告スクリプトを一切読み込まず、ゲームはそのまま遊べる。 */
(function () {
  const CONFIG = {
    enabled: false,                     // ← AdSense のサイト審査が通ったら true
    client: 'ca-pub-1975437480047330',  // siosen323@gmail.com の発行者ID（AdMobと共通）
    startSlot: '',                      // ← ゲーム開始前に出す枠のスロットID
  };

  const ready = () => !!(CONFIG.enabled && CONFIG.client && CONFIG.startSlot);

  let scriptAdded = false;
  function ensureScript() {
    if (scriptAdded || !ready()) return;
    scriptAdded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CONFIG.client);
    document.head.appendChild(s);
  }

  window.ADS = {
    // 広告を出せる状態か。false なら game.js は広告画面を挟まずそのまま開始する。
    available: ready,
    // 指定した要素の中に広告ユニットを1つ作って読み込ませる。
    render(container) {
      if (!ready() || !container) return false;
      ensureScript();
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', CONFIG.client);
      ins.setAttribute('data-ad-slot', CONFIG.startSlot);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      container.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (e) { return false; }
      return true;
    },
  };
})();
