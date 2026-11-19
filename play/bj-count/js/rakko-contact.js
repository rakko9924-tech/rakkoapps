/* rakko-contact.js — らっこアプリ共通「アプリを評価する」＋「問い合わせ」モジュール（ドロップイン）
 *
 * 使い方:
 *   <script src="rakko-contact.js"></script>
 *   RakkoContact.init({
 *     app: 'money-clicker',              // 記録先タブ名になる。英数字/._- のみ
 *     storeId: '6783945758',             // App Store の Apple ID（未指定なら window.APP_STORE_ID）
 *     getState: () => ({ coins: '123' }) // 問い合わせに添える状態（文字列/数値のフラットな連想配列）
 *   });
 *   ボタンから RakkoContact.openRate() / RakkoContact.openContact() を呼ぶ。
 *   RakkoContact.askRateOnce() は「一度だけ」評価をお願いする（あとで を押しても再表示しない）。
 *
 * ⚠ セキュリティ ⚠
 * 問い合わせ本文は後でAIに読ませる前提の「未信頼データ」。ここでは制御文字除去と長さ制限のみ行い、
 * 固定スキーマ {app, ver, ts, comment, state} のJSONとして送る。受信側(GAS)でも再度サニタイズする。
 * UIには保存先や処理方法（スプレッドシート/AI）を表示しない。
 */
(function (global) {
  'use strict';

  var ENDPOINT = ''; // デプロイ後に /exec URL を設定する
  var RAKKO_URL = 'https://rakkoapps.com/';
  var RATE_KEY = 'rakkoRateAsked';

  var cfg = { app: 'unknown', storeId: '', getState: null };
  var el = {};

  var TXT = {
    rateTitle: 'このアプリはいかがですか？',
    rateBody: '楽しんでいただけていたら、App Storeでの評価をお願いします。星の評価だけでも、次のアップデートの励みになります。',
    rateGo: 'App Storeで評価する',
    later: 'あとで',
    contactTitle: '問い合わせ',
    contactLabel: 'ご意見・不具合・要望',
    contactPrivacy: '個人情報（氏名・連絡先）は書かないでください',
    contactPh: '例: ◯◯の画面で操作できなくなった',
    contactNote: '不具合の再現のため、そのとき設定していた内容もあわせて送信されます。',
    send: '送信する',
    close: '閉じる',
    sending: '送信中…',
    sent: '送信しました。ありがとうございます！',
    sendFail: '送信に失敗しました。時間をおいて再度お試しください。',
    sendCopied: '送信先を準備中のため、内容をクリップボードにコピーしました。',
    sendEmpty: '内容を入力してください。',
    rakko: 'らっこアプリ ― ほかのアプリを見る'
  };

  var CSS = [
    '.rkc-wrap{position:fixed;inset:0;z-index:99000;display:flex;align-items:flex-start;justify-content:center;',
    'background:rgba(20,26,40,.45);padding:calc(env(safe-area-inset-top,0px) + 16px) 16px 16px;overflow-y:auto;',
    '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);font-family:inherit;}',
    '.rkc-wrap[hidden]{display:none;}',
    '.rkc-card{width:100%;max-width:380px;background:#fff;color:#1c2333;border-radius:16px;padding:18px 18px 20px;',
    'box-shadow:0 18px 48px rgba(16,24,40,.28);box-sizing:border-box;}',
    '.rkc-title{font-size:17px;font-weight:800;margin:0 0 10px;}',
    '.rkc-body{font-size:13.5px;line-height:1.8;color:#3b4459;margin:0 0 16px;}',
    '.rkc-label{font-size:13.5px;font-weight:700;margin:0 0 2px;}',
    '.rkc-note{font-size:11.5px;line-height:1.6;color:#6b7590;margin:6px 0 14px;}',
    '.rkc-ta{width:100%;box-sizing:border-box;min-height:112px;border:1px solid #d7ddea;border-radius:12px;',
    'padding:10px 12px;font-size:15px;line-height:1.6;font-family:inherit;color:#1c2333;background:#fff;resize:none;',
    '-webkit-user-select:text;user-select:text;}',
    '.rkc-ta:focus{outline:none;border-color:#2b50e0;}',
    '.rkc-btn{display:block;width:100%;box-sizing:border-box;border:none;border-radius:12px;padding:13px 16px;',
    'font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:8px;}',
    '.rkc-btn.primary{background:#2b50e0;color:#fff;}',
    '.rkc-btn.ghost{background:#fff;color:#3b4459;border:1px solid #d7ddea;}',
    '.rkc-status{font-size:12.5px;line-height:1.6;text-align:center;margin:12px 0 0;color:#2b50e0;min-height:1em;}',
    '.rkc-link{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;font-size:12.5px;',
    'color:#6b7590;text-decoration:none;}'
  ].join('');

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* AI読み込み前提のサニタイズ: 制御文字除去＋長さ制限。本文は未信頼データとして扱う */
  function sanitize(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);
  }

  function isNative() {
    try { return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }

  function storeId() {
    return String(cfg.storeId || global.APP_STORE_ID || '');
  }

  function appVersion() {
    return String(global.APP_VERSION || '');
  }

  function ensureStyle() {
    if (document.getElementById('rkc-style')) return;
    var st = document.createElement('style');
    st.id = 'rkc-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function buildWrap() {
    var wrap = h('div', 'rkc-wrap');
    wrap.hidden = true;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.addEventListener('click', function (e) { if (e.target === wrap) hide(wrap); });
    document.body.appendChild(wrap);
    return wrap;
  }

  function show(wrap) { wrap.hidden = false; }
  function hide(wrap) { wrap.hidden = true; }

  /* ---------- 評価 ---------- */

  function openReview() {
    var tail = '/app/id' + storeId() + '?action=write-review';
    try {
      if (isNative()) global.location.href = 'itms-apps://itunes.apple.com' + tail;
      else global.open('https://apps.apple.com' + tail, '_blank', 'noopener');
    } catch (e) {}
  }

  function buildRate() {
    ensureStyle();
    var wrap = buildWrap();
    var card = h('div', 'rkc-card');
    card.appendChild(h('h2', 'rkc-title', TXT.rateTitle));
    card.appendChild(h('p', 'rkc-body', TXT.rateBody));

    var go = h('button', 'rkc-btn primary', TXT.rateGo);
    go.type = 'button';
    go.addEventListener('click', function () { markAsked(); hide(wrap); openReview(); });

    var later = h('button', 'rkc-btn ghost', TXT.later);
    later.type = 'button';
    later.addEventListener('click', function () { markAsked(); hide(wrap); });

    card.appendChild(go);
    card.appendChild(later);
    wrap.appendChild(card);
    return wrap;
  }

  function markAsked() {
    try { localStorage.setItem(RATE_KEY, '1'); } catch (e) {}
  }

  function alreadyAsked() {
    try { return localStorage.getItem(RATE_KEY) === '1'; } catch (e) { return false; }
  }

  /* ---------- 問い合わせ ---------- */

  function buildContact() {
    ensureStyle();
    var wrap = buildWrap();
    var card = h('div', 'rkc-card');
    card.appendChild(h('h2', 'rkc-title', TXT.contactTitle));
    card.appendChild(h('p', 'rkc-label', TXT.contactLabel));
    card.appendChild(h('p', 'rkc-note', TXT.contactPrivacy));

    var ta = h('textarea', 'rkc-ta');
    ta.maxLength = 1000;
    ta.placeholder = TXT.contactPh;
    card.appendChild(ta);
    card.appendChild(h('p', 'rkc-note', TXT.contactNote));

    var send = h('button', 'rkc-btn primary', TXT.send);
    send.type = 'button';
    var close = h('button', 'rkc-btn ghost', TXT.close);
    close.type = 'button';
    close.addEventListener('click', function () { hide(wrap); });
    var status = h('p', 'rkc-status', '');

    send.addEventListener('click', function () {
      var comment = sanitize(ta.value, 1000).trim();
      if (!comment) { status.textContent = TXT.sendEmpty; return; }
      var payload = {
        app: cfg.app,
        ver: 1,
        ts: new Date().toISOString(),
        comment: comment,
        state: collectState()
      };
      if (!ENDPOINT) {
        var text = JSON.stringify(payload);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { status.textContent = TXT.sendCopied; },
            function () { status.textContent = TXT.sendFail; }
          );
        } else { status.textContent = TXT.sendFail; }
        return;
      }
      send.disabled = true;
      status.textContent = TXT.sending;
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }).then(function () {
        status.textContent = TXT.sent;
        ta.value = '';
      }, function () {
        status.textContent = TXT.sendFail;
      }).then(function () { send.disabled = false; });
    });

    card.appendChild(send);
    card.appendChild(close);
    card.appendChild(status);

    var link = h('a', 'rkc-link', TXT.rakko);
    link.href = RAKKO_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    card.appendChild(link);

    wrap.appendChild(card);
    wrap.__ta = ta;
    wrap.__status = status;
    return wrap;
  }

  /* 問い合わせに添える状態（個人情報は入れない。各値は短く切り詰める） */
  function collectState() {
    var out = { appVer: appVersion(), native: isNative() ? '1' : '0', ua: sanitize(navigator.userAgent, 300) };
    var extra = null;
    try { extra = cfg.getState ? cfg.getState() : null; } catch (e) { extra = null; }
    if (extra && typeof extra === 'object') {
      for (var k in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
        if (!/^[A-Za-z0-9_.\-]{1,30}$/.test(k)) continue;
        var v = extra[k];
        out[k] = sanitize(typeof v === 'object' ? JSON.stringify(v) : v, 300);
      }
    }
    return out;
  }

  /* ---------- public ---------- */

  var api = {
    init: function (opts) {
      opts = opts || {};
      if (opts.app) cfg.app = String(opts.app);
      if (opts.storeId) cfg.storeId = String(opts.storeId);
      if (typeof opts.getState === 'function') cfg.getState = opts.getState;
      if (typeof opts.endpoint === 'string') ENDPOINT = opts.endpoint;
      if (opts.texts) { for (var k in opts.texts) { if (TXT[k] !== undefined) TXT[k] = opts.texts[k]; } }
      return api;
    },
    openRate: function () {
      // 言語切替に追従できるよう、開くたびに作り直す
      if (el.rate && el.rate.parentNode) el.rate.parentNode.removeChild(el.rate);
      el.rate = buildRate();
      show(el.rate);
    },
    /** まだ一度も出していなければ評価をお願いする。出したら true */
    askRateOnce: function () {
      if (alreadyAsked()) return false;
      api.openRate();
      return true;
    },
    rateAsked: alreadyAsked,
    openContact: function () {
      if (el.contact && el.contact.parentNode) el.contact.parentNode.removeChild(el.contact);
      el.contact = buildContact();
      show(el.contact);
      try { el.contact.__ta.focus(); } catch (e) {}
    },
    rakkoUrl: RAKKO_URL
  };

  global.RakkoContact = api;
})(window);
