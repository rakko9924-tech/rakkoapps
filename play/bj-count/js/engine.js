// 卓の進行（配る → 保険 → プレイヤー → ディーラー → 清算）
// 実戦モードと検算の両方がこれを使う。ルールの解釈は tools/sim/bjsim.c と同じ。
//   ・スプリットは4ハンドまで。Aのスプリットは1枚だけ・再スプリットなし
//   ・ダブルは最初の2枚ならいつでも（スプリット後は DAS のときだけ）
//   ・レイトサレンダーは最初の2枚・スプリット前だけ（ホールカード確認のあと）
//   ・ホールカードなしの卓（ENHC）では、相手がBJならダブル・スプリットで増やした分も全部負ける
import { cardValue } from './cards.js';
import { handInfo, decide } from './strategy.js';

export function newHand(bet) {
  return { cards: [], bet, doubled: false, surrendered: false, bust: false, isSplit: false, splitAces: false, done: false, natural: false, result: null, delta: 0 };
}
const vals = (h) => h.cards.map(cardValue);
export const infoOf = (h) => handInfo(vals(h));

export class Round {
  // seats: [{ bet, bot }]   bot=true の席は基本戦略で自動
  constructor(shoe, rules, seats, opts = {}) {
    this.shoe = shoe; this.rules = rules;
    this.seats = seats.map((s, i) => ({ index: i, bot: !!s.bot, bet: s.bet, hands: [newHand(s.bet)], insurance: 0, delta: 0 }));
    this.dealer = { cards: [], holeHidden: false, bj: false };
    this.phase = 'deal';
    this.cur = null; // { seat, hand }
    this.events = opts.quiet ? null : [];
    this.botDecide = opts.botDecide || null; // (info, up, can, tc) => 'H'|'S'|'D'|'P'|'R'
    this.tcStart = shoe.tc; this.rcStart = shoe.rc; this.decksLeftStart = shoe.decksLeft;
  }
  ev(e) { if (this.events) this.events.push(e); }
  get up() { return cardValue(this.dealer.cards[0]); }

  deal() {
    const sh = this.shoe;
    for (const s of this.seats) { const c = sh.drawSeen(); s.hands[0].cards.push(c); this.ev({ t: 'card', seat: s.index, hand: 0, card: c }); }
    { const c = sh.drawSeen(); this.dealer.cards.push(c); this.ev({ t: 'card', seat: 'D', card: c }); }
    for (const s of this.seats) { const c = sh.drawSeen(); s.hands[0].cards.push(c); this.ev({ t: 'card', seat: s.index, hand: 0, card: c }); }
    if (this.rules.peek) { const c = sh.draw(); this.dealer.cards.push(c); this.dealer.holeHidden = true; this.ev({ t: 'card', seat: 'D', card: c, down: true }); }
    for (const s of this.seats) { const h = s.hands[0]; const i = infoOf(h); h.natural = i.total === 21 && h.cards.length === 2; }
    if (this.up === 1) { this.phase = 'insurance'; this.ev({ t: 'phase', phase: 'insurance' }); }
    else this.afterInsurance();
    return this;
  }

  // choices: 席番号 → true（保険に入る）。入った席は賭け金の半分を追加で置く
  insure(choices = {}) {
    if (this.phase !== 'insurance') throw new Error('not insurance phase');
    for (const s of this.seats) if (choices[s.index]) { s.insurance = s.bet / 2; this.ev({ t: 'insure', seat: s.index, amount: s.insurance }); }
    this.afterInsurance();
    return this;
  }

  afterInsurance() {
    const r = this.rules, up = this.up;
    if (r.peek && (up === 1 || up === 10)) {
      const hole = cardValue(this.dealer.cards[1]);
      if (up + hole === 11) { // ディーラーBJ
        this.dealer.bj = true;
        this.revealHole();
        for (const s of this.seats) {
          const h = s.hands[0];
          if (h.natural) this.settleHand(s, h, 0, 'push'); else this.settleHand(s, h, -h.bet, 'lose');
          if (s.insurance) { s.delta += s.insurance * 2; this.ev({ t: 'insPay', seat: s.index, delta: s.insurance * 2 }); }
        }
        return this.finish();
      }
      this.ev({ t: 'peek', bj: false });
      for (const s of this.seats) if (s.insurance) { s.delta -= s.insurance; this.ev({ t: 'insPay', seat: s.index, delta: -s.insurance }); }
    }
    // ナチュラルの清算（ホールカードなしの卓で相手がA/10のときは、相手の2枚目を待つ）
    const wait = !r.peek && (up === 1 || up === 10);
    for (const s of this.seats) {
      const h = s.hands[0];
      if (h.natural) { h.done = true; if (!wait) this.settleHand(s, h, h.bet * (r.bj65 ? 1.2 : 1.5), 'bj'); }
    }
    this.phase = 'play';
    this.cur = { seat: 0, hand: 0 };
    this.advance();
    return this;
  }

  revealHole() {
    if (this.dealer.holeHidden) { this.dealer.holeHidden = false; this.shoe.see(this.dealer.cards[1]); this.ev({ t: 'reveal', card: this.dealer.cards[1] }); }
  }

  totalHands(seat) { return seat.hands.length; }

  // いまの手で何ができるか
  can(seat, h) {
    const i = infoOf(h), r = this.rules;
    return {
      D: h.cards.length === 2 && (!h.isSplit || r.das),
      P: h.cards.length === 2 && i.pairVal > 0 && seat.hands.length < 4 && !h.splitAces,
      R: r.ls && r.peek && h.cards.length === 2 && !h.isSplit,
    };
  }
  current() {
    if (this.phase !== 'play' || !this.cur) return null;
    const seat = this.seats[this.cur.seat], hand = seat.hands[this.cur.hand];
    return { seat, hand, info: infoOf(hand), can: this.can(seat, hand) };
  }

  // 入力が要る手（プレイヤーの番）まで進める。ボットの手は自動で打つ
  advance() {
    for (;;) {
      if (this.phase !== 'play') return;
      const seat = this.seats[this.cur.seat];
      if (!seat) return this.dealerTurn();
      const h = seat.hands[this.cur.hand];
      if (!h) { this.cur = { seat: this.cur.seat + 1, hand: 0 }; continue; }
      if (h.cards.length === 1) { // スプリットした手に2枚目を配る
        const c = this.shoe.drawSeen(); h.cards.push(c); this.ev({ t: 'card', seat: seat.index, hand: this.cur.hand, card: c });
        if (h.splitAces) h.done = true;
      }
      const info = infoOf(h);
      if (!h.done && info.total >= 21) h.done = true;
      if (h.done) { this.cur = { seat: this.cur.seat, hand: this.cur.hand + 1 }; continue; }
      if (!seat.bot) { this.ev({ t: 'turn', seat: seat.index, hand: this.cur.hand }); return; }
      const can = this.can(seat, h);
      const a = this.botDecide ? this.botDecide(info, this.up, can, this.shoe.tc) : 'S';
      this.apply(a);
    }
  }

  // プレイヤーの行動
  act(a) {
    const c = this.current();
    if (!c) throw new Error('no hand to act');
    if (a === 'D' && !c.can.D) throw new Error('cannot double');
    if (a === 'P' && !c.can.P) throw new Error('cannot split');
    if (a === 'R' && !c.can.R) throw new Error('cannot surrender');
    this.apply(a);
    this.advance();
    return this;
  }

  apply(a) {
    const seat = this.seats[this.cur.seat], hi = this.cur.hand, h = seat.hands[hi], sh = this.shoe;
    this.ev({ t: 'act', seat: seat.index, hand: hi, act: a });
    if (a === 'S') { h.done = true; }
    else if (a === 'R') { h.surrendered = true; h.done = true; }
    else if (a === 'H') {
      const c = sh.drawSeen(); h.cards.push(c); this.ev({ t: 'card', seat: seat.index, hand: hi, card: c });
      const i = infoOf(h);
      if (i.bust) { h.bust = true; h.done = true; this.ev({ t: 'bust', seat: seat.index, hand: hi }); }
    } else if (a === 'D') {
      h.doubled = true; h.bet *= 2;
      const c = sh.drawSeen(); h.cards.push(c); this.ev({ t: 'card', seat: seat.index, hand: hi, card: c, dbl: true });
      if (infoOf(h).bust) { h.bust = true; this.ev({ t: 'bust', seat: seat.index, hand: hi }); }
      h.done = true;
    } else if (a === 'P') {
      const second = h.cards.pop();
      const g = newHand(seat.bet);
      g.cards.push(second);
      const aces = cardValue(second) === 1;
      h.isSplit = g.isSplit = true; h.splitAces = g.splitAces = aces;
      seat.hands.splice(hi + 1, 0, g);
      this.ev({ t: 'split', seat: seat.index, hand: hi });
      // このあと advance() が2枚目を配る
    }
  }

  dealerTurn() {
    this.phase = 'dealer';
    const r = this.rules, sh = this.shoe, d = this.dealer;
    let live = false, pendingNat = false, anyIns = false;
    for (const s of this.seats) {
      if (s.insurance) anyIns = true;
      for (const h of s.hands) {
        if (h.natural && h.result === null) pendingNat = true;
        else if (!h.bust && !h.surrendered && h.result === null) live = true;
      }
    }
    if (r.peek) this.revealHole();
    else if (live || pendingNat || anyIns) {
      const c = sh.drawSeen(); d.cards.push(c); this.ev({ t: 'card', seat: 'D', card: c });
      d.bj = this.up + cardValue(c) === 11;
    }
    if (live && !d.bj) {
      for (;;) {
        const i = handInfo(d.cards.map(cardValue));
        if (i.bust) break;
        if (i.total >= 17 && !(r.h17 && i.soft && i.total === 17)) break;
        const c = sh.drawSeen(); d.cards.push(c); this.ev({ t: 'card', seat: 'D', card: c });
      }
    }
    const di = handInfo(d.cards.map(cardValue));
    for (const s of this.seats) {
      if (!r.peek && s.insurance) { const delta = d.bj ? s.insurance * 2 : -s.insurance; s.delta += delta; this.ev({ t: 'insPay', seat: s.index, delta }); }
      for (const h of s.hands) {
        if (h.result !== null) continue;
        if (h.surrendered) { this.settleHand(s, h, -h.bet / 2, 'surrender'); continue; }
        if (h.bust) { this.settleHand(s, h, -h.bet, 'bust'); continue; }
        if (h.natural) { if (d.bj) this.settleHand(s, h, 0, 'push'); else this.settleHand(s, h, h.bet * (r.bj65 ? 1.2 : 1.5), 'bj'); continue; }
        if (d.bj) { this.settleHand(s, h, -h.bet, 'lose'); continue; }
        const t = infoOf(h).total;
        if (di.bust || t > di.total) this.settleHand(s, h, h.bet, 'win');
        else if (t < di.total) this.settleHand(s, h, -h.bet, 'lose');
        else this.settleHand(s, h, 0, 'push');
      }
    }
    this.finish();
  }

  settleHand(seat, h, delta, result) {
    h.result = result; h.delta = delta; h.done = true; seat.delta += delta;
    this.ev({ t: 'settle', seat: seat.index, hand: seat.hands.indexOf(h), delta, result });
  }

  finish() {
    // 全員バストなどでディーラーが引かなかった場合も、伏せ札は表にする
    if (this.rules.peek) this.revealHole();
    this.phase = 'over';
    this.ev({ t: 'over' });
  }
}

// 検算用: 1席・賭け金1で打ち続け、開始時のトゥルーカウント別に結果を集計する
export function simulateFlat({ shoe, rules, chart, rows, insTc, rounds, tcMax = 12 }) {
  const NT = 2 * tcMax + 1;
  const n = new Float64Array(NT), s = new Float64Array(NT), ss = new Float64Array(NT);
  const botDecide = (info, up, can, tc) => decide(chart, rows, info, up, tc, can).act;
  for (let i = 0; i < rounds; i++) {
    if (shoe.needShuffle()) shoe.shuffle();
    const tci = Math.max(-tcMax, Math.min(tcMax, shoe.tc)) + tcMax;
    const rd = new Round(shoe, rules, [{ bet: 1, bot: true }], { quiet: true, botDecide });
    rd.deal();
    if (rd.phase === 'insurance') rd.insure(rows && shoe.tc >= insTc ? { 0: true } : {});
    const d = rd.seats[0].delta;
    n[tci]++; s[tci] += d; ss[tci] += d * d;
  }
  return { n, s, ss, tcMax };
}
