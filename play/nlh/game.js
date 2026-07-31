/* game.js — ヘッズアップ NLH のゲームエンジンとUI制御
   1台のiPhoneを2人で挟んで対面プレイ（正面通し）する。
   ・各プレイヤーの手番では、まず「プライバシーゲート」を表示して覗き見を防ぐ。
   ・相手側（席2）の画面は180°回転して表示できる。 */

(function () {
  const P = window.Poker;
  const $ = (sel) => document.querySelector(sel);

  // ---- 設定の保存（端末内のみ） ----
  const SETTINGS_KEY = 'nlh_settings_v2';
  const defaultSettings = {
    names: ['プレイヤー1', 'プレイヤー2'],
    startStack: 20000,   // 100BB（@ BB200）
    smallBlind: 100,
    bigBlind: 200,
    ante: 200,           // BBアンティ（BBプレイヤーが支払う）
    rotateP2: true,      // 席2の画面を180°回転
    sound: true,         // 効果音（無料）
    // 課金で解放される設定（解放されていない間は既定値に固定）
    bbDisplay: false,    // 金額をBB表示
    anteOff: false,      // アンティ無し
    tournament: false,   // トーナメントモード（ブラインド上昇）
  };
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return Object.assign({}, defaultSettings, s || {});
    } catch (e) {
      return Object.assign({}, defaultSettings);
    }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
  let settings = loadSettings();

  // 効果音（sound.js）。設定OFFや非対応環境では何もしない。
  function sfx(name) {
    if (settings.sound && window.SFX) window.SFX.play(name);
  }

  // ---- 機能フラグ（Web版は全機能を無料開放）----
  // 旧 iOS 版では BB表示／初期スタック編集／トーナメント／ante無しを App内課金で
  // 解放していたが、Web版では課金そのものを廃止し、常に全機能が使える。
  function isUnlocked() { return true; }

  // ---- 現在のブラインド／アンティ（トーナメントなら上昇） ----
  // トーナメントのブラインド表（SB, BB, ante）。一定ハンドごとにレベルが上がる。
  const TOURNEY_LEVELS = [
    { sb: 100, bb: 200, ante: 200 },
    { sb: 150, bb: 300, ante: 300 },
    { sb: 200, bb: 400, ante: 400 },
    { sb: 300, bb: 600, ante: 600 },
    { sb: 500, bb: 1000, ante: 1000 },
    { sb: 800, bb: 1600, ante: 1600 },
    { sb: 1200, bb: 2400, ante: 2400 },
    { sb: 2000, bb: 4000, ante: 4000 },
    { sb: 3000, bb: 6000, ante: 6000 },
    { sb: 5000, bb: 10000, ante: 10000 },
  ];
  const HANDS_PER_LEVEL = 8;
  function tourneyLevel() {
    const lv = Math.floor(((G ? G.handNo : 1) - 1) / HANDS_PER_LEVEL);
    return Math.max(0, Math.min(TOURNEY_LEVELS.length - 1, lv));
  }
  function currentBlinds() {
    if (settings.tournament && isUnlocked('tournament')) {
      return TOURNEY_LEVELS[tourneyLevel()];
    }
    const ante = (settings.anteOff && isUnlocked('no_ante')) ? 0 : settings.ante;
    return { sb: settings.smallBlind, bb: settings.bigBlind, ante };
  }

  // 現在のブラインド表示（トーナメントならレベルと次レベルまでのハンド数も）。
  function blindsLabel() {
    const b = (H && H.blinds) ? H.blinds : currentBlinds();
    const ante = b.ante > 0 ? ` (ante ${b.ante.toLocaleString('en-US')})` : '';
    let base = `${b.sb.toLocaleString('en-US')}-${b.bb.toLocaleString('en-US')}${ante}`;
    if (settings.tournament && isUnlocked('tournament')) {
      const lv = tourneyLevel();
      const handsLeft = HANDS_PER_LEVEL - (((G ? G.handNo : 1) - 1) % HANDS_PER_LEVEL);
      const next = lv < TOURNEY_LEVELS.length - 1 ? `・あと${handsLeft}ハンドで上昇` : '・最終レベル';
      base = `Lv.${lv + 1}　${base}${next}`;
    }
    return base;
  }

  // 金額の表示整形（BB表示が解放＆ONなら BB 単位）。
  function fmt(n) {
    if (settings.bbDisplay && isUnlocked('bb_display')) {
      const bb = currentBlinds().bb || 1;
      const v = Math.round((n / bb) * 10) / 10;
      return v + 'BB';
    }
    return n.toLocaleString('en-US');
  }

  // ---- チップのビジュアル化 ----
  // 金額を実際のチップ（カジノ風の額面別カラー）の山として表現する。
  // BB表示の有無に関わらず「実チップ枚数」を表すので、額面は固定の階段で貪欲法分解する。
  const CHIP_DENOMS = [
    { v: 100000, cls: 'c100k' }, // 黒金
    { v: 25000,  cls: 'c25k' },  // 茶
    { v: 5000,   cls: 'c5k' },   // ピンク
    { v: 1000,   cls: 'c1k' },   // 黄(ゴールド)
    { v: 500,    cls: 'c500' },  // 紫
    { v: 100,    cls: 'c100' },  // 黒
    { v: 25,     cls: 'c25' },   // 緑
    { v: 5,      cls: 'c5' },    // 赤
    { v: 1,      cls: 'c1' },    // 白
  ];
  function chipBreakdown(n) {
    n = Math.max(0, Math.round(n));
    const out = [];
    for (const d of CHIP_DENOMS) {
      if (n >= d.v) { const c = Math.floor(n / d.v); n -= c * d.v; out.push({ cls: d.cls, count: c }); }
    }
    return out;
  }
  // 金額 n を額面別のチップの山（HTML）にする。size: 'sm' | 'md'。
  function chipStacksHTML(n, size) {
    const D = size === 'md' ? { d: 20, o: 5 } : { d: 15, o: 4 };
    const bd = chipBreakdown(n);
    if (!bd.length) return '';
    const stacks = bd.map((c) => {
      const shown = Math.min(c.count, 6);
      const h = D.d + (shown - 1) * D.o;
      let discs = '';
      for (let k = 0; k < shown; k++) {
        discs += `<i class="pchip ${c.cls}" style="width:${D.d}px;height:${D.d}px;bottom:${k * D.o}px"></i>`;
      }
      const x = c.count > 6 ? `<span class="chip-x">×${c.count}</span>` : '';
      return `<span class="chip-stack" style="width:${D.d}px;height:${h}px">${discs}${x}</span>`;
    }).join('');
    return `<span class="chips" aria-hidden="true">${stacks}</span>`;
  }

  // ---- ゲーム状態 ----
  let G = null; // 試合全体（スタック等）
  let H = null; // 1ハンドの状態
  let chipFx = null; // 直近のアクションでポットに入ったチップ（移動演出用 {player, add}）

  function newMatch() {
    G = {
      stacks: [settings.startStack, settings.startStack],
      button: 0, // ボタン（＝ヘッズアップではSB）
      handNo: 0,
    };
  }

  function startHand() {
    if (G.stacks[0] <= 0 || G.stacks[1] <= 0) {
      showGameOver();
      return;
    }
    G.handNo++;
    const deck = P.shuffle(P.makeDeck());
    const sb = G.button; // ヘッズアップではボタンがSB、先にアクション（プリフロップ）
    const bb = 1 - sb;
    const blinds = currentBlinds();

    H = {
      deck,
      holes: [[deck.pop(), deck.pop()], [deck.pop(), deck.pop()]],
      board: [],
      street: 'preflop', // preflop|flop|turn|river|showdown
      startStacks: [G.stacks[0], G.stacks[1]], // ハンド開始時のスタック（純増減の表示用）
      pot: 0,
      bet: [0, 0], // このストリートで投入した額
      committed: [0, 0], // このハンドで投入した総額（アンティ等のデッドマネーは含めない）
      sb, bb,
      blinds,
      toAct: sb, // プリフロップはSB(ボタン)から
      lastRaiseSize: blinds.bb,
      lastAggressor: bb, // プリフロップのBBはオプションを持つ
      actedSinceRaise: new Set(),
      folded: [false, false],
      allIn: [false, false],
      finished: false,
      log: [],
    };

    // アンティ（BBアンティ：BBプレイヤーがポットに支払う。ベット額には含めない＝デッドマネー）
    if (blinds.ante > 0) postAnte(bb, blinds.ante);
    // ブラインド投入
    postBlind(sb, blinds.sb);
    postBlind(bb, blinds.bb);
    H.lastRaiseSize = blinds.bb;
    const anteMsg = blinds.ante > 0 ? `、アンティ ${blinds.ante}` : '';
    pushLog(`#${G.handNo} 開始。${settings.names[sb]} がSB ${blinds.sb}、${settings.names[bb]} がBB ${blinds.bb}${anteMsg} を投入。`);

    // プリフロップ。SBがコールしてもBBにオプションがあるので actedSinceRaise はBBを未行動扱い。
    H.actedSinceRaise = new Set();
    renderAction();
  }

  function postBlind(i, amount) {
    const pay = Math.min(amount, G.stacks[i]);
    G.stacks[i] -= pay;
    H.bet[i] += pay;
    H.committed[i] += pay;
    H.pot += pay;
    if (G.stacks[i] === 0) H.allIn[i] = true;
  }

  // アンティはポットに入るがベット額・committed には含めない（未コール返金の対象外）。
  function postAnte(i, amount) {
    const pay = Math.min(amount, G.stacks[i]);
    G.stacks[i] -= pay;
    H.pot += pay;
    if (G.stacks[i] === 0) H.allIn[i] = true;
  }

  function pushLog(msg) {
    H.log.unshift(msg);
    if (H.log.length > 40) H.log.pop();
  }

  // ---- アクション ----
  function currentToCall(i) {
    return Math.max(0, H.bet[1 - i] - H.bet[i]);
  }

  function roundClosed() {
    // ベッティングラウンドが終了したか判定する。
    const live = [0, 1].filter((i) => !H.folded[i]);
    if (live.length < 2) return true; // 片方フォールド
    const nonAllIn = live.filter((i) => !H.allIn[i]);
    if (nonAllIn.length === 0) return true; // 全員オールイン
    if (nonAllIn.length === 1) {
      // 行動できるのは1人だけ（相手はオールイン）。その1人が額を満たし行動済みなら終了。
      const i = nonAllIn[0];
      return H.bet[i] >= H.bet[1 - i] && H.actedSinceRaise.has(i);
    }
    // 2人とも行動可能：ベット額が揃い、両者がレイズ以降に行動済みか
    const betsEqual = H.bet[0] === H.bet[1];
    return betsEqual && live.every((i) => H.actedSinceRaise.has(i) || H.allIn[i]);
  }

  // ---- ホーム画面に追加（Android / デスクトップChrome はワンタップで追加できる） ----
  // iOS Safari はこのAPIが無いので、ホーム画面の説明どおり手動で追加してもらう。
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    const btn = document.getElementById('a2hs-install');
    if (btn) btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; });
  function wireInstallButton() {
    const btn = document.getElementById('a2hs-install');
    if (!btn) return;
    btn.hidden = !installPrompt;
    btn.onclick = async () => {
      if (!installPrompt) return;
      sfx('click');
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (e) { /* 無視 */ }
      installPrompt = null;
      btn.hidden = true;
    };
  }

  // ---- ホームに戻るボタン（対局中・結果画面の中央帯に置く） ----
  // 上下どちら向きでも読めるよう、回転しない中央帯の隅に固定する。
  // アイコンは Lucide（ISC）の house。絵文字は端末ごとに見た目が変わるので使わない。
  const HOUSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>`;
  const homeBtnHTML = `<button class="homebtn" data-home aria-label="ホームに戻る" title="ホームに戻る">${HOUSE_SVG}</button>`;
  function wireHomeBtn() {
    document.querySelectorAll('[data-home]').forEach((b) => {
      b.onclick = () => { sfx('click'); askLeave(); };
    });
  }

  // 中断確認。ブラウザ標準の confirm() はPWAだとドメイン名が出て興ざめなので自前で出す。
  function askLeave() {
    if (document.querySelector('.modal-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-title">ホームに戻りますか？</p>
        <p class="modal-body">対局を中断します。今のチップ状況はリセットされます。</p>
        <div class="modal-btns">
          <button class="btn" data-leave-no>つづける</button>
          <button class="btn fold" data-leave-yes>ホームに戻る</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('[data-leave-no]').onclick = () => { sfx('click'); close(); };
    wrap.querySelector('[data-leave-yes]').onclick = () => { sfx('click'); close(); renderHome(); };
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
  }

  // 増額アクションの呼び方。プリフロップはブラインドが既にベットなので、
  // コール額が0（BBに option が回ってきた場面など）でも「レイズ」。
  function raiseWord(toCall) {
    return (toCall === 0 && H.street !== 'preflop') ? 'ベット' : 'レイズ';
  }

  function act(type, amount) {
    const i = H.toAct;
    if (H.finished) return;
    const toCall = currentToCall(i);

    if (type === 'fold') {
      H.folded[i] = true;
      sfx('fold');
      pushLog(`${settings.names[i]} がフォールド。`);
      endHandByFold(1 - i);
      return;
    }

    if (type === 'check') {
      if (toCall !== 0) return; // 不正
      sfx('check');
      pushLog(`${settings.names[i]} がチェック。`);
      H.actedSinceRaise.add(i);
    }

    if (type === 'call') {
      const pay = Math.min(toCall, G.stacks[i]);
      G.stacks[i] -= pay;
      H.bet[i] += pay;
      H.committed[i] += pay;
      H.pot += pay;
      if (G.stacks[i] === 0) H.allIn[i] = true;
      sfx(G.stacks[i] === 0 ? 'allin' : 'chip');
      pushLog(`${settings.names[i]} がコール (${pay})。`);
      if (pay > 0) chipFx = { player: i, add: pay };
      H.actedSinceRaise.add(i);
    }

    if (type === 'raise' || type === 'bet' || type === 'allin') {
      // amount = このストリートでの「合計ベット額」（bet[i] を含む目標値）
      let target = amount;
      const maxTarget = H.bet[i] + G.stacks[i];
      if (type === 'allin') target = maxTarget;
      target = Math.min(target, maxTarget);
      const add = target - H.bet[i];
      G.stacks[i] -= add;
      H.bet[i] = target;
      H.committed[i] += add;
      H.pot += add;
      const raiseSize = target - H.bet[1 - i];
      if (raiseSize > 0) H.lastRaiseSize = Math.max(H.lastRaiseSize, raiseSize);
      if (G.stacks[i] === 0) H.allIn[i] = true;
      if (add > 0) chipFx = { player: i, add };
      sfx(H.allIn[i] ? 'allin' : 'chips');
      const word = raiseWord(toCall);
      pushLog(`${settings.names[i]} が${word} ${target}${H.allIn[i] ? ' (オールイン)' : ''}。`);
      // レイズが入ったので相手は再び行動が必要
      H.actedSinceRaise = new Set([i]);
    }

    // 次へ
    advance();
  }

  function endHandByFold(winner) {
    H.finished = true;
    G.stacks[winner] += H.pot;
    sfx('win');
    pushLog(`${settings.names[winner]} が ${H.pot} を獲得（相手フォールド）。`);
    H.result = { type: 'fold', winner, pot: H.pot };
    H.street = 'showdown';
    renderResult();
  }

  function advance() {
    if (roundClosed()) {
      goNextStreet();
      return;
    }
    // 相手の番へ。相手が行動不能（フォールド/オールイン）ならラウンド終了扱い。
    const next = 1 - H.toAct;
    if (H.folded[next] || H.allIn[next]) {
      goNextStreet();
      return;
    }
    H.toAct = next;
    renderAction();
  }

  function dealBoard(n) {
    for (let k = 0; k < n; k++) H.board.push(H.deck.pop());
  }

  function resetStreetBets() {
    H.bet = [0, 0];
    H.actedSinceRaise = new Set();
    H.lastRaiseSize = H.blinds.bb;
    // ポストフロップはBB(=非ボタン)から
    H.toAct = H.bb;
    // 行動不能な側はスキップ
  }

  function someoneAllIn() {
    return (H.allIn[0] || H.allIn[1]);
  }

  function goNextStreet() {
    // 全員オールイン or 片方オールインでコール済み → 残りのボードを配って決着
    const needRunout = someoneAllIn();

    if (needRunout) {
      // 残りカードを全部配ってショーダウン
      sfx('deal');
      while (H.board.length < 5) {
        if (H.board.length === 0) dealBoard(3);
        else dealBoard(1);
      }
      H.street = 'showdown';
      doShowdown();
      return;
    }

    if (H.street === 'preflop') {
      H.street = 'flop';
      dealBoard(3);
      resetStreetBets();
      maybeSkipOrGate();
    } else if (H.street === 'flop') {
      H.street = 'turn';
      dealBoard(1);
      resetStreetBets();
      maybeSkipOrGate();
    } else if (H.street === 'turn') {
      H.street = 'river';
      dealBoard(1);
      resetStreetBets();
      maybeSkipOrGate();
    } else if (H.street === 'river') {
      H.street = 'showdown';
      doShowdown();
    }
  }

  function maybeSkipOrGate() {
    sfx('deal');
    pushLog(`--- ${streetLabel(H.street)} ---`);
    renderAction();
  }

  function doShowdown() {
    H.finished = true;
    // 未コールのベット（オーバーベット分）は多く出した側へ払い戻す。
    const diff = H.committed[0] - H.committed[1];
    if (diff > 0) { G.stacks[0] += diff; H.pot -= diff; H.committed[0] -= diff; pushLog(`未コール分 ${diff} を ${settings.names[0]} に返却。`); }
    else if (diff < 0) { G.stacks[1] += -diff; H.pot -= -diff; H.committed[1] -= -diff; pushLog(`未コール分 ${-diff} を ${settings.names[1]} に返却。`); }

    const e0 = P.evaluate7([...H.holes[0], ...H.board]);
    const e1 = P.evaluate7([...H.holes[1], ...H.board]);
    const c = P.cmpScore(e0.score, e1.score);
    let winner;
    if (c > 0) winner = 0;
    else if (c < 0) winner = 1;
    else winner = -1; // 引き分け

    if (winner === -1) {
      const half = Math.floor(H.pot / 2);
      G.stacks[0] += half;
      G.stacks[1] += H.pot - half;
      pushLog(`引き分け（スプリットポット）。`);
    } else {
      G.stacks[winner] += H.pot;
      pushLog(`${settings.names[winner]} が ${H.pot} を獲得（${winner === 0 ? e0.name : e1.name}）。`);
    }
    H.result = { type: 'showdown', winner, pot: H.pot, e0, e1 };
    sfx('win');
    renderResult();
  }

  // ---- 表示ヘルパ ----
  function streetLabel(s) {
    return { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', showdown: 'ショーダウン' }[s];
  }

  // カード表面の中身（左上・中央・右下にランク／スート）。
  function faceInner(c) {
    const r = P.RANK_LABEL[c.r], s = P.SUIT_SYMBOL[c.s];
    return `<span class="idx tl"><b>${r}</b><i>${s}</i></span>`
         + `<span class="pip">${s}</span>`
         + `<span class="idx br"><b>${r}</b><i>${s}</i></span>`;
  }
  function cardHTML(c, faceUp) {
    if (!faceUp) return `<div class="card back"></div>`;
    return `<div class="card ${P.SUIT_COLOR[c.s]}">${faceInner(c)}</div>`;
  }
  // GGポーカー風スクイーズ用カード。裏面の右下角をスワイプでめくって表面（右下のインデックス）を覗く。
  function squeezeCardHTML(p, k, rot) {
    const c = H.holes[p][k];
    return `<div class="sqcard ${rot ? 'rot' : ''}" data-player="${p}" data-idx="${k}">
        <div class="card sq-face ${P.SUIT_COLOR[c.s]}">${faceInner(c)}</div>
        <div class="card sq-back"></div>
        <div class="card back sq-fold"></div>
      </div>`;
  }

  // ---- 画面：アクション（固定・縦対称テーブル） ----
  // プレイヤー0=下、プレイヤー1=上で常に固定。コミュニティカードは上下中央に置く。
  function renderAction() {
    const actor = H.toAct;
    const opp = 1 - actor;
    const toCall = currentToCall(actor);

    const board = [0, 1, 2, 3, 4].map((k) =>
      H.board[k] ? cardHTML(H.board[k], true) : `<div class="card placeholder"></div>`
    ).join('');

    const minRaiseTarget = H.bet[opp] + Math.max(H.lastRaiseSize, H.blinds.bb);
    const maxTarget = H.bet[actor] + G.stacks[actor];

    const faceDown = `${cardHTML(null, false)}${cardHTML(null, false)}`;

    const initVal = Math.min(minRaiseTarget, maxTarget);

    // 各プレイヤーのアクション列（両者ぶん常に表示し、手番でない側は無効化）。
    // 手番側のレイズUIは席内（＝自分側の半分）にインライン展開する（GGPoker風）。
    const seatActions = (p) => {
      const isActor = (p === actor);
      const tc = Math.max(0, H.bet[1 - p] - H.bet[p]);
      const cr = G.stacks[p] > tc && !H.allIn[1 - p];
      const rw = raiseWord(tc);
      const dis = isActor ? '' : 'disabled';
      const callOrCheck = tc > 0
        ? `<button class="btn call" data-act="call" ${dis}>コール<span class="amt">${fmt(Math.min(tc, G.stacks[p]))}</span></button>`
        : `<button class="btn check" data-act="check" ${dis}>チェック</button>`;
      // チェックできるとき（コール額0）はフォールド不可。オールインはレイズUI内に集約。
      const buttons = `<div class="actions ${isActor ? 'live' : 'dim'}">
          ${tc > 0 ? `<button class="btn fold" data-act="fold" ${dis}>フォールド</button>` : ''}
          ${callOrCheck}
          ${cr ? `<button class="btn raise" ${isActor ? 'id="openRaise"' : ''} ${dis}>${rw}</button>` : ''}
        </div>`;
      // レイズ用インラインパネル（手番側のみ）。スライダー＋サイズボタン＋確定。
      const betui = (isActor && cr) ? `
        <div class="betui" data-min="${initVal}" data-max="${maxTarget}" data-step="${H.blinds.sb}">
          <div class="bet-head"><span class="bet-label">${rw}額（合計）</span><b class="bet-val">${fmt(initVal)}</b></div>
          <div class="bet-chips">${chipStacksHTML(initVal, 'md')}</div>
          <div class="bet-presets">
            <button class="chip" data-frac="min">最小</button>
            <button class="chip" data-frac="0.5">½</button>
            <button class="chip" data-frac="0.75">¾</button>
            <button class="chip" data-frac="1">ポット</button>
            <button class="chip" data-frac="max">オールイン</button>
          </div>
          <div class="bet-slider-row">
            <button class="step" data-step="-1">−</button>
            <input type="range" class="bet-range" min="${initVal}" max="${maxTarget}" step="${H.blinds.sb}" value="${initVal}">
            <button class="step" data-step="1">＋</button>
          </div>
          <div class="bet-confirm-row">
            <button class="btn betcancel" data-betcancel>✕ 戻る</button>
            <button class="btn primary betconfirm" data-betconfirm>${rw} <b class="bet-val">${fmt(initVal)}</b></button>
          </div>
        </div>` : '';
      return `<div class="action-col">${buttons}${betui}</div>`;
    };

    // 1プレイヤー分の席：左に情報＋手札、右にアクション列。
    const seatHTML = (p) => {
      const isActor = (p === actor);
      const rot = (p === 1 && settings.rotateP2) ? 'rot180' : '';
      const tag = `<div class="player-tag ${isActor ? 'me' : ''}">${settings.names[p]} ・ スタック ${fmt(G.stacks[p])}</div>`;
      const peekBlock = `
        <div class="peek" data-player="${p}">
          <div class="hole big squeeze">${squeezeCardHTML(p, 0, !!rot)}${squeezeCardHTML(p, 1, !!rot)}</div>
          <div class="peek-hint">右下角をスワイプしてスクイーズ</div>
          <div class="peek-eval myhand" style="visibility:hidden">&nbsp;</div>
        </div>`;
      return `<div class="seat seat-${p} ${rot} ${isActor ? 'actor' : 'idle'}">
          <div class="seat-main">${tag}${peekBlock}</div>
          ${seatActions(p)}
        </div>`;
    };

    // 境界線の手前に出すベット表示（ブラインド含む）とディーラーボタン。
    // p=1 は上席なので、その席から正位置になるよう180°回転する。
    const tableBetHTML = (p, pos) => {
      const rotb = (p === 1 && settings.rotateP2) ? 'rot180' : '';
      const dealer = (p === H.sb) ? `<span class="dealer-btn">D</span>` : '';
      const bet = H.bet[p] > 0
        ? `${chipStacksHTML(H.bet[p])}<span class="bet-amt">${fmt(H.bet[p])}</span>`
        : '';
      return `<div class="table-bet ${pos} ${rotb}">${dealer}${bet}</div>`;
    };

    $('#app').innerHTML = `
      <div class="table2">
        ${seatHTML(1)}
        <div class="center">
          ${homeBtnHTML}
          ${tableBetHTML(1, 'bet-top')}
          <div class="center-mid">
            <div class="blinds-line">${blindsLabel()}</div>
            <div class="pot">POT <b>${fmt(H.pot)}</b></div>
            <div class="pot-chips">${chipStacksHTML(H.pot, 'md')}</div>
            <div class="board">${board}</div>
            <div class="street">${streetLabel(H.street)} ・ ${settings.names[actor]} の番</div>
          </div>
          ${tableBetHTML(0, 'bet-bot')}
        </div>
        ${seatHTML(0)}
      </div>`;

    wireHomeBtn();

    // GGポーカー風スクイーズ。手札エリアをスワイプすると2枚同時に角がめくれる。指を離すと自動で伏せる。
    document.querySelectorAll('.peek').forEach((peek) => {
      const p = parseInt(peek.dataset.player, 10);
      const evalEl = peek.querySelector('.peek-eval');
      const evName = H.board.length >= 3 ? P.evaluate7([...H.holes[p], ...H.board]).name : '';
      const cards = [...peek.querySelectorAll('.sqcard')].map((card) => ({
        card,
        back: card.querySelector('.sq-back'),
        fold: card.querySelector('.sq-fold'),
      }));
      if (!cards.length) return;
      const refreshEval = () => {
        const open = peek.querySelector('.sqcard.open');
        if (open && evName) { evalEl.textContent = evName; evalEl.style.visibility = 'visible'; }
        else { evalEl.style.visibility = 'hidden'; }
      };
      let dragging = false, flipped = false, sx0 = 0, sy0 = 0;
      let W = 0, Hh = 0, maxL = 0, rot = false;
      // 同じ L を両カードに適用（各カードはローカル座標の右下角からめくる）。
      const applyAll = (L) => {
        L = Math.max(0, Math.min(maxL, L));
        const open = L >= 1;
        cards.forEach(({ card, back, fold }) => {
          if (!open) {
            back.style.clipPath = ''; fold.style.clipPath = ''; fold.style.opacity = '0';
            card.classList.remove('open');
          } else {
            back.style.clipPath = `polygon(0 0, ${W}px 0, ${W}px ${Hh - L}px, ${W - L}px ${Hh}px, 0 ${Hh}px)`;
            fold.style.clipPath = `polygon(${W - L}px ${Hh}px, ${W}px ${Hh - L}px, ${W - L}px ${Hh - L}px)`;
            fold.style.opacity = '1';
            card.classList.add('open');
          }
        });
        refreshEval();
      };
      // スワイプ量（開始点からの移動距離）でめくり量を決める。上席は回転しているため符号を反転。
      const peelLen = (e) => {
        const d = rot ? ((e.clientX - sx0) + (e.clientY - sy0)) : ((sx0 - e.clientX) + (sy0 - e.clientY));
        return d;
      };
      const onDown = (e) => {
        e.preventDefault();
        const r = cards[0].card.getBoundingClientRect();
        W = r.width; Hh = r.height; maxL = Math.min(W, Hh);
        rot = cards[0].card.classList.contains('rot');
        dragging = true; flipped = false; sx0 = e.clientX; sy0 = e.clientY;
        if (peek.setPointerCapture) { try { peek.setPointerCapture(e.pointerId); } catch (_) {} }
        applyAll(0);
      };
      const onMove = (e) => {
        if (!dragging) return; e.preventDefault();
        const L = peelLen(e); applyAll(L);
        if (!flipped && L > maxL * 0.45) { flipped = true; sfx('flip'); }
      };
      const onUp = (e) => {
        if (!dragging) return; dragging = false;
        applyAll(0);
      };
      peek.addEventListener('pointerdown', onDown);
      peek.addEventListener('pointermove', onMove);
      peek.addEventListener('pointerup', onUp);
      peek.addEventListener('pointercancel', onUp);
      peek.addEventListener('contextmenu', (ev) => ev.preventDefault());
    });

    // レイズ用インラインパネル（自分側の席内で完結）。先に配線して all-in からも使えるようにする。
    const openRaiseBtn = $('#openRaise');
    let openRaising = null; // () => レイズUIをMAXで開く（all-in 用）
    if (openRaiseBtn) {
      const seat = openRaiseBtn.closest('.seat');
      const betui = seat.querySelector('.betui');
      const range = betui.querySelector('.bet-range');
      const min = parseInt(betui.dataset.min, 10);
      const max = parseInt(betui.dataset.max, 10);
      const step = parseInt(betui.dataset.step, 10);
      const incr = H.blinds.bb; // ＋／− はBB単位で調整
      const valEls = betui.querySelectorAll('.bet-val');
      const chips = betui.querySelectorAll('.chip');
      const betChipsEl = betui.querySelector('.bet-chips');

      const setVal = (v) => {
        v = Math.round(v / step) * step;
        v = Math.max(min, Math.min(max, v));
        range.value = v;
        valEls.forEach((e) => { e.textContent = fmt(v); });
        if (betChipsEl) betChipsEl.innerHTML = chipStacksHTML(v, 'md');
        // どのプリセットに一致するか軽くハイライト
        chips.forEach((ch) => {
          const t = presetTarget(ch.dataset.frac);
          ch.classList.toggle('active', t === v);
        });
      };
      const presetTarget = (frac) => {
        if (frac === 'min') return min;
        if (frac === 'max') return max;
        const potAfterCall = H.pot + toCall;
        const t = H.bet[opp] + Math.round(potAfterCall * parseFloat(frac));
        return Math.max(min, Math.min(max, Math.round(t / step) * step));
      };
      const openPanel = (v) => { seat.classList.add('raising'); setVal(v); };

      openRaiseBtn.onclick = () => openPanel(parseInt(range.value, 10));
      openRaising = () => openPanel(max);
      betui.querySelector('[data-betcancel]').onclick = () => seat.classList.remove('raising');
      betui.querySelector('[data-betconfirm]').onclick = () =>
        act(toCall === 0 ? 'bet' : 'raise', parseInt(range.value, 10));
      range.oninput = () => setVal(parseInt(range.value, 10));
      betui.querySelectorAll('.step').forEach((s) => {
        s.onclick = () => setVal(parseInt(range.value, 10) + parseInt(s.dataset.step, 10) * incr);
      });
      chips.forEach((ch) => { ch.onclick = () => setVal(presetTarget(ch.dataset.frac)); });
    }

    // アクションボタン（手番側 .live のみ有効）
    document.querySelectorAll('.actions.live [data-act]').forEach((b) => {
      b.onclick = () => {
        const a = b.getAttribute('data-act');
        if (a === 'allin') {
          // レイズ可能ならレイズUIをMAXで開いて確定させる（中央モーダルを使わず自分側で確認）。
          if (openRaising) openRaising();
          else act('allin');
        } else {
          act(a);
        }
      };
    });

    // 直前のアクションでポットに入ったチップを、そのプレイヤーのベット位置からポットへ移動させる演出。
    if (chipFx) { const fx = chipFx; chipFx = null; setTimeout(() => playChipFx(fx), 0); }
  }

  // チップがポットへ流れ込み「＋金額」が浮かぶ演出（ベットアクション画面用）。
  function playChipFx(fx) {
    const potEl = document.querySelector('.center .pot');
    const srcEl = document.querySelector(fx.player === 1 ? '.bet-top' : '.bet-bot');
    if (!potEl || !srcEl) return;
    const pr = potEl.getBoundingClientRect();
    const sr = srcEl.getBoundingClientRect();
    const px = pr.left + pr.width / 2, py = pr.top + pr.height / 2;
    const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;

    let layer = document.querySelector('.fx-layer');
    if (!layer) { layer = document.createElement('div'); layer.className = 'fx-layer'; document.body.appendChild(layer); }

    // チップを数枚飛ばす
    for (let k = 0; k < 3; k++) {
      const chip = document.createElement('i');
      chip.className = 'fx-chip';
      chip.style.left = sx + 'px';
      chip.style.top = sy + 'px';
      layer.appendChild(chip);
      void chip.offsetWidth; // リフロウしてトランジションを確実に発火
      setTimeout(() => {
        chip.style.transitionDelay = (k * 70) + 'ms';
        chip.style.transform = `translate(${px - sx}px, ${py - sy}px) scale(.55)`;
        chip.style.opacity = '0.15';
      }, 20);
      setTimeout(() => chip.remove(), 750 + k * 70);
    }
    // ＋金額のポップ
    const plus = document.createElement('div');
    plus.className = 'fx-plus';
    plus.textContent = '+' + fmt(fx.add);
    plus.style.left = px + 'px';
    plus.style.top = (pr.top - 2) + 'px';
    layer.appendChild(plus);
    void plus.offsetWidth;
    setTimeout(() => { plus.style.transform = 'translate(-50%,-26px)'; plus.style.opacity = '0'; }, 20);
    setTimeout(() => plus.remove(), 770);
    // ポットを軽く強調
    potEl.classList.remove('fx-pulse'); void potEl.offsetWidth; potEl.classList.add('fx-pulse');
  }

  // ---- ハンド結果（専用ページは作らず、プレイ画面のまま表示） ----
  // 画面遷移せず、いつものテーブルレイアウト上で相手のカードを公開し勝者を示す。
  // アクションボタンの位置に「次のハンドへ」（バスト時は「ゲーム終了へ」）を置いて続行する。
  function renderResult() {
    const r = H.result;
    const over = (G.stacks[0] <= 0 || G.stacks[1] <= 0);
    const reveal = (r.type === 'showdown'); // ショーダウンは両者公開／フォールドは伏せたまま

    const board = [0, 1, 2, 3, 4].map((k) =>
      H.board[k] ? cardHTML(H.board[k], true) : `<div class="card placeholder"></div>`
    ).join('');

    // 各プレイヤーのハンド純増減（ハンド開始時スタックとの差）。勝者は＋、敗者は−。
    const netHTML = (p) => {
      const net = G.stacks[p] - (H.startStacks ? H.startStacks[p] : G.stacks[p]);
      if (net > 0) return `<span class="win-amt">+${fmt(net)}</span>`;
      if (net < 0) return `<span class="lose-amt">-${fmt(-net)}</span>`;
      return '';
    };

    let winnerText;
    if (r.type === 'showdown') {
      winnerText = r.winner === -1 ? '引き分け（スプリット）' : `${settings.names[r.winner]} の勝ち`;
    } else {
      winnerText = `${settings.names[r.winner]} の勝ち（相手フォールド）`;
    }

    const contLabel = over ? 'ゲーム終了へ' : '次のハンドへ';

    const endSeatHTML = (p) => {
      const rot = (p === 1 && settings.rotateP2) ? 'rot180' : '';
      const isWinner = (r.winner === p) || (r.winner === -1);
      const cards = reveal
        ? H.holes[p].map((c) => cardHTML(c, true)).join('')
        : H.holes[p].map(() => cardHTML(null, false)).join('');
      const ev = reveal ? (p === 0 ? r.e0 : r.e1) : null;
      const win = netHTML(p);
      const handLine = ev ? `<div class="peek-eval myhand">${ev.name}</div>` : '';
      return `<div class="seat seat-${p} ${rot} ${isWinner ? 'winner' : ''}">
          <div class="seat-main">
            <div class="player-tag ${isWinner ? 'me' : ''}">${settings.names[p]} ・ スタック ${fmt(G.stacks[p])} ${win}</div>
            <div class="hole big">${cards}</div>
            ${handLine}
          </div>
          <div class="action-col">
            <div class="actions"><button class="btn primary" data-cont>${contLabel}</button></div>
          </div>
        </div>`;
    };

    $('#app').innerHTML = `
      <div class="table2 ended">
        ${endSeatHTML(1)}
        <div class="center">
          ${homeBtnHTML}
          <div class="center-mid">
            <div class="blinds-line">${blindsLabel()}</div>
            <div class="pot">POT <b>${fmt(r.pot)}</b></div>
            <div class="pot-chips">${chipStacksHTML(r.pot, 'md')}</div>
            <div class="board">${board}</div>
            <div class="street">${winnerText}</div>
          </div>
        </div>
        ${endSeatHTML(0)}
      </div>`;

    wireHomeBtn();

    const cont = over ? showGameOver : () => { G.button = 1 - G.button; startHand(); };
    document.querySelectorAll('[data-cont]').forEach((b) => { b.onclick = cont; });
  }

  function showGameOver() {
    const winner = G.stacks[0] > G.stacks[1] ? 0 : 1;
    $('#app').innerHTML = `
      <div class="gameover">
        <h1><img class="go-trophy" src="./icons/ui/trophy.png" width="48" height="48" alt=""> ゲーム終了</h1>
        <p class="big-win">${settings.names[winner]} の勝利！</p>
        <p>${settings.names[0]}: ${fmt(G.stacks[0])}　/　${settings.names[1]}: ${fmt(G.stacks[1])}</p>
        <button class="btn big primary" id="restart">もう一度遊ぶ</button>
      </div>`;
    $('#restart').onclick = renderHome;
  }

  // ---- 画面：ホーム/設定 ----
  function renderHome() {
    const b = currentBlinds();
    const bbCount = Math.round((settings.startStack / b.bb) * 10) / 10;
    const ante = b.ante > 0 ? ` (ante ${b.ante.toLocaleString('en-US')})` : '';

    // ホーム画面に追加する手順。すでにアプリとして起動していれば出さない。
    // 端末に応じて自分の手順が先頭に来るように並べ替える。
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const a2hsSteps = {
      ios: `<div class="a2hs-os">iPhone / iPad（<b>Safari</b>で開いてください）</div>
          <ol class="a2hs-steps">
            <li>画面下（iPadは右上）の<b>共有ボタン</b> <span class="a2hs-ico">⬆️</span>（四角から上向き矢印）をタップ</li>
            <li>メニューを下にスクロールして <b>「ホーム画面に追加」</b> をタップ</li>
            <li>右上の <b>「追加」</b> をタップ</li>
          </ol>
          <p class="a2hs-note">※ Chrome など Safari 以外のブラウザからは追加できません。</p>`,
      android: `<div class="a2hs-os">Android（Chrome）</div>
          <ol class="a2hs-steps">
            <li>右上の <b>⋮</b>（メニュー）をタップ</li>
            <li><b>「ホーム画面に追加」</b>（または「アプリをインストール」）をタップ</li>
            <li><b>「追加」</b> → <b>「自動的に追加」</b> をタップ</li>
          </ol>`,
      pc: `<div class="a2hs-os">パソコン（Chrome / Edge）</div>
          <ol class="a2hs-steps">
            <li>アドレスバー右端の<b>インストールアイコン</b>（画面に下向き矢印）をクリック</li>
            <li><b>「インストール」</b> をクリック</li>
          </ol>`,
    };
    const a2hsOrder = isIOS ? ['ios', 'android', 'pc'] : isAndroid ? ['android', 'ios', 'pc'] : ['pc', 'ios', 'android'];
    const a2hsHTML = isStandalone ? '' : `
        <details class="rules panel a2hs">
          <summary>ホーム画面に追加する（アプリのように使う）</summary>
          <div class="rules-body">
            <p>ホーム画面に追加すると、アドレスバーの無い全画面で起動でき、電波がなくても遊べます。</p>
            <button class="btn a2hs-install" id="a2hs-install" hidden>ホーム画面に追加する</button>
            ${a2hsOrder.map((k) => a2hsSteps[k]).join('')}
          </div>
        </details>`;

    const optToggle = (settingKey, label, sub) =>
      `<label class="check paid">
          <input type="checkbox" id="${settingKey}" ${settings[settingKey] ? 'checked' : ''}>
          <span class="pt-label">${label}${sub ? `<span class="pt-sub">${sub}</span>` : ''}</span>
        </label>`;

    $('#app').innerHTML = `
      <div class="home">
        <div class="logo">♠♥<br>HEADS-UP<br><span>NLH ポーカー</span></div>
        <p class="tag">オフライン・対面プレイ（正面通し）</p>

        <div class="panel">
          <div class="fmt-line">フォーマット：<b>${b.sb.toLocaleString('en-US')}-${b.bb.toLocaleString('en-US')}${ante}</b>　スタック <b>${settings.startStack.toLocaleString('en-US')}</b>（${bbCount}BB）${settings.tournament ? '　トーナメント' : ''}</div>
        </div>

        <div class="panel settings">
          <div class="row2">
            <label>プレイヤー1
              <input id="n0" type="text" value="${escapeAttr(settings.names[0])}" maxlength="10">
            </label>
            <label>プレイヤー2
              <input id="n1" type="text" value="${escapeAttr(settings.names[1])}" maxlength="10">
            </label>
          </div>
          <label class="check">
            <input id="snd" type="checkbox" ${settings.sound ? 'checked' : ''}>
            <span class="pt-label">効果音</span>
          </label>
          <div class="panel-title" style="margin-top:6px">詳細設定</div>
          <label>
            <span class="pt-label">開始スタック</span>
            <input id="ss" type="number" value="${settings.startStack}" min="200" step="100">
          </label>
          ${optToggle('bbDisplay', 'BB表示', 'スタックやポットをBB単位で表示')}
          ${optToggle('anteOff', 'ante無しモード', 'アンティを無しにして対戦')}
          ${optToggle('tournament', 'トーナメントモード', 'ハンドが進むとブラインドが上昇')}
        </div>

        <button class="btn big primary" id="start">ゲーム開始</button>

        <details class="rules panel">
          <summary>遊び方 / ルール</summary>
          <div class="rules-body">
            <p>1台のスマホを2人で挟み、向かい合って遊ぶヘッズアップ（1対1）の No Limit Texas Hold'em です。完全オフラインで動作します。</p>
            <ul>
              <li>手番のプレイヤーの手札を長押し（左手で隠して右手で捲る感覚）すると自分の手札を確認できます。</li>
              <li>フォールド／チェック／コール／ベット・レイズ／オールインから選びます。</li>
              <li>各ハンド終了でボタン（🔘＝ディーラー兼SB）が交代します。</li>
              <li>どちらかのスタックが0になるとゲーム終了です。</li>
            </ul>
          </div>
        </details>
        ${a2hsHTML}
        <p class="version">v1.1</p>
      </div>`;

    wireInstallButton();

    $('#start').onclick = () => {
      settings.names[0] = ($('#n0').value || 'プレイヤー1').trim();
      settings.names[1] = ($('#n1').value || 'プレイヤー2').trim();
      settings.rotateP2 = true; // 常に回転（対面で各自が正位置に）
      settings.sound = $('#snd').checked;
      if (window.SFX) window.SFX.setEnabled(settings.sound);
      sfx('click');
      settings.startStack = clampInt($('#ss').value, 200, 100000000, 20000);
      settings.bbDisplay = $('#bbDisplay').checked;
      settings.anteOff = $('#anteOff').checked;
      settings.tournament = $('#tournament').checked;
      saveSettings(settings);
      startMatch();
    };
  }

  // ---- 対局開始（広告が有効なら開始前に1枚はさむ） ----
  function startMatch() {
    if (window.ADS && window.ADS.available()) { renderStartAd(); return; }
    newMatch();
    startHand();
  }

  // 広告画面。広告が実際に配信されたときだけ待ち時間を設ける。
  // 未配信（審査中・在庫なし・ブロッカー）なら空の枠で待たせずそのまま開始する。
  const AD_WAIT_SEC = 5;
  function renderStartAd() {
    $('#app').innerHTML = `
      <div class="adscreen">
        <div class="ad-label">広告</div>
        <div class="ad-slot" id="adslot"><span class="ad-loading">読み込み中…</span></div>
        <div class="ad-foot">
          <button class="btn big primary" id="adgo" disabled>まもなく開始</button>
        </div>
      </div>`;
    let started = false;
    const begin = () => { if (started) return; started = true; sfx('click'); newMatch(); startHand(); };

    window.ADS.render($('#adslot')).then((filled) => {
      if (started) return;
      if (!filled) { begin(); return; }
      const loading = document.querySelector('.ad-loading');
      if (loading) loading.remove();

      const go = $('#adgo');
      let left = AD_WAIT_SEC;
      const tick = () => { go.innerHTML = `まもなく開始（<span>${left}</span>）`; };
      tick();
      const timer = setInterval(() => {
        left -= 1;
        if (left > 0) { tick(); return; }
        clearInterval(timer);
        go.disabled = false;
        go.textContent = 'ゲームを始める';
      }, 1000);
      go.onclick = () => { if (!go.disabled) begin(); };
    });
  }

  function clampInt(v, lo, hi, dflt) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = dflt;
    return Math.max(lo, Math.min(hi, n));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ---- テスト用フック（ブラウザ動作には影響しない） ----
  window.NLH = {
    _state: () => ({ G, H }),
    _setSettings: (s) => { settings = Object.assign({}, defaultSettings, s); },
    newMatch, startHand, act, renderAction, renderResult, renderHome, showGameOver,
    get G() { return G; }, get H() { return H; },
  };

  // ---- 起動 ----
  if (window.SFX) window.SFX.setEnabled(settings.sound);
  window.addEventListener('DOMContentLoaded', renderHome);

  // Service Worker 登録（Web/PWA のオフライン化用）。
  // ネイティブ（Capacitor）ではローカル配信のため不要かつ、アプリ更新時に
  // 旧アセットがキャッシュに残る不具合の原因になるので登録しない。
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
