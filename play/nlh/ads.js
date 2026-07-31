/* ads.js — Web版の広告（Google AdSense）
   AdMob はアプリ専用でWebページには使えないため、Web版の収益化は AdSense を使う。

   セットアップ済み（2026-07-31）:
     - 発行者アカウント pub-1975437480047330（AdMob と共通）
     - rakkoapps.com は ads.txt で所有権確認済み → サイト審査待ち
     - 広告ユニット「NLHポーカー ゲーム開始前」＝ ディスプレイ広告／レスポンシブ
   審査が通るまでは在庫が付かない（unfilled）。その場合は待たせずゲームを開始する
   ので、承認前でもプレイ体験は変わらない。CONFIG.enabled を false にすれば
   広告スクリプト自体を読み込まなくなる。 */
(function () {
  const CONFIG = {
    enabled: true,
    client: 'ca-pub-1975437480047330',  // siosen323@gmail.com の発行者ID（AdMobと共通）
    startSlot: '6052222234',            // 広告ユニット「NLHポーカー ゲーム開始前」
  };
  // 広告が埋まったか判定するまでの待ち時間。審査中や在庫切れでは配信されないので、
  // その場合は待たせずゲームを始める（空の枠を見せて5秒待たせないため）。
  const FILL_TIMEOUT_MS = 2500;

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
    // 戻り値は Promise<boolean>：広告が実際に表示されたら true、
    // 未配信（審査中・在庫なし・ブロッカー）なら false。
    render(container) {
      if (!ready() || !container) return Promise.resolve(false);
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
      catch (e) { return Promise.resolve(false); }

      // AdSense は在庫が無いと ins に data-ad-status="unfilled" を付ける。
      // 付かないまま高さも出ない場合（スクリプト自体が読めない等）も未配信扱い。
      return new Promise((resolve) => {
        const t0 = Date.now();
        const check = () => {
          const status = ins.getAttribute('data-ad-status');
          if (status === 'filled') { resolve(true); return; }
          if (status === 'unfilled') { resolve(false); return; }
          if (Date.now() - t0 >= FILL_TIMEOUT_MS) { resolve(ins.offsetHeight > 0); return; }
          setTimeout(check, 100);
        };
        check();
      });
    },
  };
})();
