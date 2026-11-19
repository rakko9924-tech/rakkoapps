// 第6章 実戦 — 卓で配られる札を数えながら、賭けて打つ
import { h, s, fmt, signed, pts, seg, cardEl, pageHead, numberPad, verdict, icon } from './dom.js';
import { Shoe, cardValue, randInt, tagOf, trueCount } from '../cards.js';
import { Round } from '../engine.js';
import { handInfo, decide, devRows, baseAction, ACT_NAME, upLabel } from '../strategy.js';
import { betFor, gradeBet } from '../betting.js';
import { betInput, actionKeys, yesNoKeys, handLabel, optionsBox, nextButton, bringIntoView, rampStrip } from './parts.js';

const RES_TEXT = { win: '勝ち', lose: '負け', push: '引き分け', bj: 'ブラックジャック', bust: 'バスト', surrender: 'サレンダー' };

export function mount(page, app) {
  const st = app.state, data = app.data, m = data.money, rules = st.rules, o = st.opts;
  const rows = data.useIdx ? devRows(data.devs) : null;
  const clampTc = (t) => Math.max(data.rows[0].tc, Math.min(data.rows[data.rows.length - 1].tc, t));
  const shoe = new Shoe(rules.decks, rules.pen, app.rng);
  // 前回の続き: お金の条件が同じなら、資金と通算の手数を引き継ぐ（山は新しく混ぜる）
  const sig = `${m.bank}|${m.min}|${m.max}|${m.step}`;
  const sv0 = st.tableSave;
  const saved = sv0 && sv0.sig === sig && Number.isFinite(sv0.bank) && sv0.bank >= m.min ? sv0 : null;
  let bank = saved ? Math.round(sv0.bank) : m.bank;
  const total = { rounds: saved ? Math.max(0, sv0.rounds | 0) : 0, start: saved && Number.isFinite(sv0.start) ? sv0.start : m.bank };
  let alive = true, round = null, evPos = 0, lastBet = m.min, turn = null, newest = null, pad = null;
  let untilCheck = 2 + randInt(app.rng, 3), fb = null, showCount = false, hiding = false, betting = false, resetPending = false, lastLines = [];
  let shoeLog = newShoeLog(), rampHands = 0;
  function newShoeLog() { return { rounds: 0, betOk: 0, betN: 0, upOk: 0, upN: 0, playNg: 0, playN: 0, cntOk: 0, cntN: 0, start: bank, misses: [] }; }
  const dec = (x) => (Number.isInteger(x) ? signed(x) : x.toFixed(2).replace('-', '−'));

  // 山を混ぜる。「途中から」のときは、山の25%〜（深さ−10%）までを配り終えたことにし、
  // トゥルーカウントが +1〜+5 に動いた場面から始める（賭け金を上げる練習の場面を増やす）
  function startShoe() {
    shoe.shuffle();
    if ((o.tableStart || 'fresh') !== 'mid') return null;
    const N = shoe.N, lo = Math.floor(N * 0.25), hi = Math.max(lo + 1, Math.floor((N * (rules.pen - 10)) / 100));
    for (let tries = 0; tries < 400; tries++) {
      if (tries) shoe.shuffle();
      const n = lo + randInt(app.rng, hi - lo);
      let rc = 0;
      for (let i = 0; i < n; i++) rc += tagOf(shoe.cards[i]);
      const tc = trueCount(rc, N - n);
      if (tc >= 1 && tc <= 5) { shoe.pos = n; shoe.rc = rc; shoe.seen = n; rampHands = 2; return { rc, n }; }
    }
    shoe.shuffle();
    return null;
  }
  const startText = (ms, first) => (ms
    ? `途中からです。ここまでに配られた約${(ms.n / 52).toFixed(1)}デッキのランニングカウントは ${signed(ms.rc)}（残り約${shoe.decksLeft.toFixed(1)}デッキ）。ここから数えて。`
    : first ? '山は混ぜたばかり。カウントは 0 から数えます。' : '山を混ぜ直しました。カウントは 0 から。');

  const vm = { dealer: [], seats: [] };
  const delay = () => (o.dealSpeed === 2 ? 110 : 260);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const userIdx = () => vm.seats.length - 1;
  const eachReveal = () => (o.tableReveal || 'each') === 'each';

  // ---- 画面の骨組み ----
  const hud = h('div', { class: 'hud' });
  const dealerCards = h('div', { class: 'hand-cards' }), dealerTotal = h('span', { class: 'felt__total' });
  const tray = h('div', { class: 'felt__tray' });
  const botsEl = h('div', { class: 'felt__seats' }), meEl = h('div', { class: 'felt__me' });
  const felt = h('section', { class: 'felt', 'aria-label': '卓' },
    h('div', { class: 'felt__dealer' }, h('div', { class: 'seat' }, h('span', { class: 'felt__label' }, 'ディーラー'), dealerCards, dealerTotal), tray),
    botsEl, meEl);
  const ctl = h('div', { class: 'stack ctl' });
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const resetBtn = h('button', { type: 'button', class: 'btn btn--small', onclick: () => {
    if (betting) { resetBank(); say('資金を最初に戻しました。'); askBet(); return; }
    resetPending = true; sayMore('この手が終わったら、資金を最初に戻します。');
  } }, '資金を最初に戻す');
  const opts = optionsBox('卓の設定',
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'ほかの客'), seg([{ value: 0, label: 'いない' }, { value: 1, label: '1人' }, { value: 2, label: '2人' }], o.bots, v => { o.bots = v; app.save(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '配る速さ'), seg([{ value: 1, label: 'ふつう' }, { value: 2, label: '速い' }], o.dealSpeed, v => { o.dealSpeed = v; app.save(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '答え合わせ'), seg([{ value: 'each', label: '1手ごと' }, { value: 'shoe', label: '山の終わりにまとめて' }], o.tableReveal || 'each', v => { o.tableReveal = v; app.save(); }),
      h('span', { class: 'field__hint' }, '「まとめて」は、山が終わるまで賭け金・打ち方・カウントの答えを出しません。変更は次の1手から。')),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '始め方'), seg([{ value: 'fresh', label: '山のはじめから' }, { value: 'mid', label: '途中から' }], o.tableStart || 'fresh', v => { o.tableStart = v; app.save(); }),
      h('span', { class: 'field__hint' }, '「途中から」は、カウントがプラスに動いた場面から始めます（はじめのランニングカウントを教えます）。賭け金を上げる練習が増えます。次の山から。')),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '資金'), h('div', { class: 'row row--wrap' }, resetBtn),
      h('span', { class: 'field__hint' }, '資金と通算の手数は、次に開いたときも続きから始まります（条件で資金やベットを変えると最初から）。')));
  page.append(pageHead({ chapter: '第6章', title: '実戦' }), opts, hud, felt, log, ctl);

  // 上の欄は一度だけ作り、あとは中身の文字だけ書き換える
  // （配っている最中に「見る」ボタンを作り直すと、iPhone では押した瞬間のタップが消える）
  const hudBank = h('span', { class: 'fact__v' }), hudDiffK = h('span', { class: 'fact__k' }), hudDiff = h('span', { class: 'fact__v' });
  const hudCv = h('span', { class: 'hud__cv' }), eyeLabel = h('span', null, '見る');
  const eye = h('button', { type: 'button', class: 'btn btn--small hud__eye', 'aria-pressed': 'false', 'data-state': 'off',
    onclick: () => { if (hiding) return; showCount = !showCount; paintHud(); paintFelt(); } }, icon('eye'), eyeLabel);
  hud.append(
    h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '資金'), hudBank),
    h('div', { class: 'fact' }, hudDiffK, hudDiff),
    h('div', { class: 'hud__count' }, h('span', { class: 'fact__k' }, 'カウント'), hudCv, eye));

  function resetBank() {
    bank = m.bank; total.start = bank; total.rounds = 0; shoeLog = newShoeLog();
    st.tableSave = null; app.save();
    paintHud();
  }

  // ---- 描画 ----
  function trayMini() {
    const W = 62, H = 92, base = 76, unit = Math.min(8.5, 62 / rules.decks), dealt = shoe.pos / 52;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': showCount ? `捨て札 約${dealt.toFixed(1)}デッキ` : '捨て札置き場' });
    svg.append(s('path', { class: 'tray__box', d: `M18 ${base - unit * rules.decks - 5} V${base} H56 V${base - unit * rules.decks - 5}` }));
    const hh = unit * dealt;
    if (hh > 0.5) svg.append(s('rect', { class: 'tray__stack', x: 21, y: base - hh, width: 32, height: hh }));
    for (let d = 0; d <= rules.decks; d++) svg.append(s('line', { class: 'tray__mark', x1: 11, x2: 17, y1: base - unit * d, y2: base - unit * d }));
    svg.append(s('text', { class: 'tray__mini', x: 37, y: H - 3, 'text-anchor': 'middle' }, '捨て札'));
    return svg;
  }
  function paintHud() {
    const diff = bank - total.start;
    hud.dataset.rounds = String(total.rounds);
    hudBank.replaceChildren(...pts(bank));
    hudDiffK.textContent = `収支（通算 ${total.rounds}手）`;
    hudDiff.textContent = `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}`;
    if (showCount) { hudCv.className = 'hud__cv'; hudCv.replaceChildren(`ランニング ${signed(shoe.rc)}・トゥルー ${signed(shoe.tc)}`, h('small', null, `（残り${shoe.decksLeft.toFixed(1)}デッキ）`)); }
    else { hudCv.className = 'hud__cv hud__cv--off'; hudCv.textContent = hiding ? '答えるまで隠しています' : '自分で数える'; }
    eye.setAttribute('aria-pressed', String(showCount)); eye.dataset.state = showCount ? 'on' : 'off'; eye.disabled = hiding;
    eyeLabel.textContent = showCount ? '隠す' : '見る';
    tray.replaceChildren(trayMini());
  }
  const totalText = (cards) => { const i = handInfo(cards.map(cardValue)); return i.bust ? 'バスト' : cards.length === 2 && i.total === 21 ? '21' : `${i.soft ? 'ソフト' : ''}${i.total}`; };
  function paintFelt() {
    dealerCards.replaceChildren(...vm.dealer.map((c) => cardEl(c.card, { down: c.down, animate: newest === c })));
    const shown = vm.dealer.filter(c => !c.down).map(c => c.card);
    dealerTotal.textContent = vm.dealer.length >= 2 && !vm.dealer.some(c => c.down) ? totalText(shown) : '';
    const seatEl = (seat, idx, me) => h('div', { class: me ? 'seat seat--me' : 'seat seat--bot' },
      h('span', { class: 'felt__label' }, me ? 'あなた' : `客${idx + 1}`),
      h('div', { class: 'seat__hands' }, seat.hands.map((hd, hi) => {
        const size = me ? (seat.hands.length > 2 ? 'sm' : '') : 'sm';
        const isTurn = me && turn && turn.seat === idx && turn.hand === hi;
        return h('div', { class: isTurn ? 'seat__hand is-turn' : 'seat__hand' },
          h('div', { class: 'hand-cards' }, hd.cards.map(c => cardEl(c.id, { size, animate: newest === c }))),
          me ? h('span', { class: 'seat__bet' }, `${fmt(hd.bet)}点${hd.dbl ? '（ダブル）' : ''}・${totalText(hd.cards.map(c => c.id))}`) : null,
          hd.res ? h('span', { class: 'seat__res', 'data-r': hd.res }, me ? `${RES_TEXT[hd.res]} ${hd.delta > 0 ? '+' : hd.delta < 0 ? '−' : '±'}${fmt(Math.abs(hd.delta))}` : RES_TEXT[hd.res]) : null);
      })));
    const ui = userIdx();
    botsEl.replaceChildren(...vm.seats.slice(0, ui).map((sv, i) => seatEl(sv, i, false)));
    botsEl.hidden = ui <= 0;
    meEl.replaceChildren(vm.seats[ui] ? seatEl(vm.seats[ui], ui, true) : h('div', { class: 'seat seat--me' }, h('span', { class: 'felt__label' }, 'あなた'), h('div', { class: 'seat__hands' })));
    if (showCount) paintHud(); else tray.replaceChildren(trayMini());
  }

  // ---- できごとを順に再生 ----
  async function flush() {
    const evs = round.events;
    while (evPos < evs.length) {
      if (!alive) return;
      const e = evs[evPos++];
      if (e.t === 'card') {
        const c = { id: e.card, card: e.card, down: !!e.down };
        if (e.seat === 'D') vm.dealer.push(c); else { vm.seats[e.seat].hands[e.hand].cards.push(c); if (e.dbl) { const hd = vm.seats[e.seat].hands[e.hand]; hd.dbl = true; hd.bet *= 2; } }
        newest = c; paintFelt(); app.sfx.play('deal'); await wait(delay());
      } else if (e.t === 'split') {
        const hs = vm.seats[e.seat].hands, src = hs[e.hand];
        hs.splice(e.hand + 1, 0, { cards: [src.cards.pop()], bet: src.bet, res: null, delta: 0 });
        newest = null; paintFelt(); await wait(delay());
      } else if (e.t === 'reveal') {
        vm.dealer[1].down = false; newest = vm.dealer[1]; paintFelt(); app.sfx.play('deal'); await wait(delay() * 1.4);
      } else if (e.t === 'turn') {
        turn = { seat: e.seat, hand: e.hand }; newest = null; paintFelt();
      } else if (e.t === 'settle') {
        const hd = vm.seats[e.seat].hands[e.hand]; hd.res = e.result; hd.delta = e.delta;
      } else if (e.t === 'over') {
        turn = null; newest = null; paintFelt();
      }
    }
  }

  const committed = () => { const sv = round.seats[round.seats.length - 1]; return sv.hands.reduce((a, hd) => a + hd.bet, 0) + sv.insurance; };
  const setCtl = (...kids) => { if (pad) { pad.destroy(); pad = null; } ctl.replaceChildren(...kids.filter(Boolean)); ctl.classList.add('is-guard'); setTimeout(() => ctl.classList.remove('is-guard'), 250); };
  // 下の欄の文（結果の行は、山の終わりの知らせなどを足しても消さない）
  const say = (...items) => { lastLines = items; log.replaceChildren(...items.map(l => (l instanceof Node ? l : h('p', null, l)))); };
  const sayMore = (...items) => say(...lastLines, ...items);

  // ---- 1. 賭ける（前の手の結果を見ながら、そのまま次の賭け金を決める） ----
  function askBet(...lead) {
    if (!alive) return;
    if (resetPending) { resetPending = false; resetBank(); lead.push(h('p', { class: 'pencil block' }, '資金を最初に戻しました。')); }
    betting = true;
    paintHud();
    const cap = Math.min(m.max, m.min + Math.floor((bank - m.min) / m.step) * m.step);
    const money = { ...m, max: Math.max(m.min, cap) };
    const input = betInput({ money, initial: Math.min(lastBet, money.max), submitLabel: '賭ける', onSubmit: (v) => { lastBet = v; startRound(v); } });
    // 「見る」を開いているときは、賭け金を決める場所にもカウントを出す（上の欄が画面の外でも見えるように）
    const peek = showCount ? h('p', { class: 'q__sub block' }, `ランニング ${signed(shoe.rc)}・トゥルー ${signed(shoe.tc)}（残り${shoe.decksLeft.toFixed(1)}デッキ）`) : null;
    // 「途中から」の山のはじめの2手は、賭け金表も添える（第3章の表と卓をつなぐ）
    const strip = rampHands > 0 ? [h('p', { class: 'field__label block' }, `賭け金表（トゥルーカウントごと。はじめの${rampHands}手だけ出します）`), rampStrip(bank, data.rows, m, null)] : [];
    setCtl(...lead, h('p', { class: 'q__text block' }, 'いくら賭ける？', h('small', { class: 'q__aside' }, `資金 ${fmt(bank)}点`)), peek, ...strip, input.el);
    bringIntoView(input.submit);
  }

  async function startRound(bet) {
    betting = false;
    if (rampHands > 0) rampHands--;
    const tc = shoe.tc, rc = shoe.rc, decksLeft = shoe.decksLeft;
    const opt = betFor(bank, data.rows.find(r => r.tc === clampTc(tc)), m);
    const capped = Math.min(opt, Math.max(m.min, m.min + Math.floor((bank - m.min) / m.step) * m.step));
    fb = { bet, opt: capped, g: gradeBet(bet, capped, m), tc, rc, decksLeft, plays: [], ins: null };
    if (capped > m.min) { shoeLog.upN++; if (fb.g === 'ok') shoeLog.upOk++; }
    const seats = [];
    for (let i = 0; i < o.bots; i++) seats.push({ bet: m.min, bot: true });
    seats.push({ bet });
    round = new Round(shoe, rules, seats, { botDecide: (info, up, can) => baseAction(data.chart, info, up, can) });
    evPos = 0; vm.dealer = []; vm.seats = seats.map(sv => ({ hands: [{ cards: [], bet: sv.bet, res: null, delta: 0 }] }));
    setCtl(h('p', { class: 'pencil block' }, '配っています…'));
    say();
    app.sfx.play('chip');
    round.deal();
    await flush();
    proceed();
  }

  async function proceed() {
    if (!alive) return;
    if (round.phase === 'insurance') return askInsurance();
    if (round.phase === 'play') { const c = round.current(); if (c && !c.seat.bot) return askAction(c); }
    if (round.phase === 'over') return finishRound();
  }

  // ---- 2. 保険 ----
  function askInsurance() {
    const canPay = bank - committed() >= fb.bet / 2;
    const want = rows && shoe.tc >= data.ins ? 'Y' : 'N';
    const keys = yesNoKeys({ yes: '入る', no: '入らない', onPick: async (a) => {
      const pick = a === 'Y' && canPay;
      fb.ins = { want, user: pick ? 'Y' : 'N', tc: shoe.tc };
      setCtl(h('p', { class: 'pencil block' }, '…'));
      round.insure(pick ? { [round.seats.length - 1]: true } : {});
      await flush(); proceed();
    } });
    setCtl(h('p', { class: 'q__text block' }, `相手の表はA。保険に入る？（${fmt(fb.bet / 2)}点）`), keys.el);
    if (!canPay) { const yes = keys.el.querySelector('button'); if (yes) yes.disabled = true; }
    bringIntoView(keys.el);
  }

  // ---- 3. 打つ ----
  function askAction(c) {
    const spare = bank - committed();
    const can = { D: c.can.D && spare >= c.hand.bet, P: c.can.P && spare >= c.seat.bet, R: c.can.R };
    const tc = shoe.tc;
    const want = decide(data.chart, rows, c.info, round.up, tc, can);
    const keys = actionKeys({ can, rules, onPick: async (a) => {
      keys.lock();
      shoeLog.playN++; fb.playN = (fb.playN || 0) + 1;
      if (a !== want.act) { shoeLog.playNg++; fb.plays.push({ label: `${handLabel(c.info)} 対 ${upLabel(round.up)}`, tc, want: want.act, user: a, dev: want.used }); }
      setCtl(h('p', { class: 'pencil block' }, '…'));
      round.act(a);
      await flush(); proceed();
    } });
    const multi = c.seat.hands.length > 1 ? `（${round.cur.hand + 1}つめの手）` : '';
    setCtl(h('p', { class: 'q__text block' }, `どう打つ？${multi}`), keys.el);
    bringIntoView(keys.el);
  }

  // ---- 4. 清算 ----
  function finishRound() {
    const sv = round.seats[round.seats.length - 1];
    bank += sv.delta;
    total.rounds++; shoeLog.rounds++; shoeLog.betN++;
    if (fb.g === 'ok') shoeLog.betOk++;
    const allOk = fb.g === 'ok' && fb.plays.length === 0 && (!fb.ins || fb.ins.want === fb.ins.user);
    st.tableSave = bank >= m.min ? { sig, bank, start: total.start, rounds: total.rounds } : null;
    app.record('table', allOk ? 1 : 0); // ここで保存もされる
    const betMiss = fb.g !== 'ok' ? `賭け金: トゥルーカウント ${signed(fb.tc)}（${signed(fb.rc)} ÷ 残り${fb.decksLeft.toFixed(1)}）→ 正解 ${fmt(fb.opt)}点、あなたは ${fmt(fb.bet)}点` : null;
    const playMiss = fb.plays.map(p => `打ち方: ${p.label}・トゥルーカウント ${signed(p.tc)} → ${ACT_NAME[p.want]}が正解（あなたは${ACT_NAME[p.user]}）`);
    const insMiss = fb.ins && fb.ins.want !== fb.ins.user ? `保険: トゥルーカウント ${signed(fb.ins.tc)} → ${fb.ins.want === 'Y' ? '入る' : '入らない'}が正解` : null;
    const misses = [betMiss, ...playMiss, insMiss].filter(Boolean);
    shoeLog.misses.push(...misses);
    const lines = [h('p', { class: 'log__res' }, `結果 ${sv.delta > 0 ? '+' : sv.delta < 0 ? '−' : '±'}${fmt(Math.abs(sv.delta))}点`)];
    if (eachReveal()) {
      const goods = [];
      if (fb.g === 'ok') goods.push(`賭け金 ◯（トゥルーカウント ${signed(fb.tc)} → ${fmt(fb.opt)}点）`);
      if (fb.playN && !fb.plays.length) goods.push('打ち方 ◯');
      if (goods.length) lines.push(h('p', { class: 'log__ok' }, goods.join('・')));
      for (const x of misses) lines.push(h('p', { class: 'log__miss' }, x));
    }
    say(...lines);
    app.sfx.play(sv.delta > 0 ? 'ok' : sv.delta < 0 ? 'ng' : 'click');
    paintHud();
    if (bank < m.min) return ruined();
    if (shoe.needShuffle()) return shoeEnd();
    // 「まとめて」のときは、山の途中でカウントの答えを出さない
    if (eachReveal() && --untilCheck <= 0) return askCount((v) => askBet(v));
    askBet();
  }

  // ---- カウントの確認（答えるあいだは、カウントの表示を隠す） ----
  function askCount(then) {
    untilCheck = 3 + randInt(app.rng, 3);
    const was = showCount;
    showCount = false; hiding = true;
    paintHud(); paintFelt();
    setCtl(); // 前の入力欄を片づけてから、新しいテンキーを置く
    const p = numberPad({ okLabel: '答える', onSubmit: (v) => {
      p.lock();
      const ok = v === shoe.rc;
      shoeLog.cntN++; if (ok) shoeLog.cntOk++;
      app.sfx.play(ok ? 'ok' : 'ng');
      hiding = false; showCount = was;
      paintHud(); paintFelt();
      // 第2章と同じ形の式: ランニング ÷ 残り ＝ 小数 → 切り下げ
      const dl = shoe.decksLeft, ex = shoe.rc / dl, exact = Number.isInteger(ex);
      then(h('div', { class: 'stack' },
        verdict(ok ? 'ok' : 'ng', ok ? '合っている' : 'ずれている', `ランニングカウント ${signed(shoe.rc)}（あなたは ${signed(v)}）`),
        h('p', { class: 'sol sol__line--calc block' }, `${signed(shoe.rc)} ÷ 残り${dl.toFixed(1)}デッキ ＝ ${dec(ex)}`, exact ? ' ＝ ' : ' → 切り下げて ', 'トゥルーカウント ', h('span', { class: 'red' }, signed(shoe.tc)), exact || ex > 0 ? '' : '（端数は小さい方へ）')));
    } });
    pad = p;
    ctl.replaceChildren(h('p', { class: 'q__text block' }, 'いまのランニングカウントは？'), p.el);
    bringIntoView(p.el.querySelector('.pad__ok'));
  }

  // ---- 山の終わり ----
  function shoeSummary(title) {
    const L = shoeLog, diff = bank - L.start;
    return h('section', { class: 'q' }, h('span', { class: 'q__no' }, title),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '手数'), h('span', { class: 'fact__v' }, String(L.rounds))),
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '収支'), h('span', { class: 'fact__v' }, `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}`)),
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '賭け金の正解'), h('span', { class: 'fact__v' }, `${L.betOk} / ${L.betN}`)),
        L.upN ? h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '上げる場面の正解'), h('span', { class: 'fact__v' }, `${L.upOk} / ${L.upN}`)) : null,
        h('div', { class: 'fact' }, h('span', { class: 'fact__k' }, '打ち方のミス'), h('span', { class: 'fact__v' }, `${L.playNg} / ${L.playN}`)),
        L.cntN ? h('div', { class: 'fact fact--wide' }, h('span', { class: 'fact__k' }, 'カウントの確認'), h('span', { class: 'fact__v' }, `${L.cntOk} / ${L.cntN}`)) : null),
      L.misses.length ? h('div', { class: 'sol', style: { marginTop: 'var(--space-xs)' } }, L.misses.slice(0, 8).map(x => h('span', { class: 'sol__line' }, x)), L.misses.length > 8 ? h('span', { class: 'sol__line' }, `ほか ${L.misses.length - 8}件`) : null) : h('p', { class: 'pencil' }, 'ミスなし'));
  }
  function shoeEnd() {
    sayMore(h('p', { class: 'log__note' }, 'カットカードが出ました。この山はここまで。最後にカウントを確かめます。'));
    askCount((v) => {
      setCtl(v, shoeSummary('この山のまとめ'), nextButton('混ぜ直して次の山へ', () => { const ms = startShoe(); shoeLog = newShoeLog(); vm.dealer = []; vm.seats = []; paintFelt(); say(startText(ms, false)); askBet(); }));
    });
  }
  function ruined() {
    st.tableSave = null; app.save();
    setCtl(h('p', { class: 'err' }, `資金が最低ベット（${fmt(m.min)}点）を下回りました。破産です。`), shoeSummary('ここまでのまとめ'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--primary grow', onclick: () => { resetBank(); const ms = startShoe(); vm.dealer = []; vm.seats = []; paintFelt(); say(`資金を戻しました。${startText(ms, false)}`); askBet(); } }, '資金を戻してやり直す'), h('a', { class: 'btn grow', href: '#/calc' }, '破産リスクを見る')));
  }

  const ms0 = startShoe();
  paintFelt();
  say(saved ? `前回の続きです（資金 ${fmt(bank)}点・通算 ${total.rounds}手）。${startText(ms0, false)}` : startText(ms0, true));
  askBet();
  return () => { alive = false; if (pad) pad.destroy(); };
}
