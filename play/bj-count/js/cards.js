// 札・カウント・山（シュー）
// 札は 0〜51 の番号（13で割った余りがランク、商がスート）。値は A=1、絵札=10。

export const RANK_LABEL = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['s', 'h', 'd', 'c']; // スペード・ハート・ダイヤ・クラブ

export const cardRank = (id) => id % 13;
export const cardSuit = (id) => ((id / 13) | 0) % 4;
export const cardValue = (id) => { const r = id % 13; return r >= 9 ? 10 : r + 1; };
export const cardLabel = (id) => RANK_LABEL[id % 13];
export const isRed = (id) => { const s = cardSuit(id); return s === 1 || s === 2; };

// Hi-Lo: 2〜6 は +1、7〜9 は 0、10・絵札・A は −1（値で引く）
export const HILO = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
export const tagOf = (id) => HILO[cardValue(id)];

// 乱数（種を渡せば再現できる）
export function makeRng(seed) {
  let a, b, c, d;
  if (seed === undefined || seed === null) {
    const u = new Uint32Array(4);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(u);
    else for (let i = 0; i < 4; i++) u[i] = (Math.random() * 2 ** 32) >>> 0;
    [a, b, c, d] = u;
  } else {
    let s = seed >>> 0;
    const next = () => { s = (s + 0x9e3779b9) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 16), 0x85ebca6b); t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35); return (t ^ (t >>> 16)) >>> 0; };
    a = next(); b = next(); c = next(); d = next();
  }
  const rng = () => { // sfc32
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

export const randInt = (rng, n) => Math.floor(rng() * n);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// トゥルーカウント（切り下げ）: ランニングカウント ÷ 残りデッキ数
export function trueCount(rc, cardsLeft) {
  return Math.floor((rc * 52) / Math.max(1, cardsLeft));
}
export function trueCountByDecks(rc, decksLeft) {
  return Math.floor(rc / decksLeft + 1e-9);
}

export class Shoe {
  constructor(decks, penPct, rng) {
    this.decks = decks; this.N = 52 * decks; this.rng = rng || makeRng();
    this.cards = new Uint8Array(this.N);
    this.setPen(penPct);
    this.shuffle();
  }
  setPen(penPct) { this.pen = penPct; this.cut = Math.floor(this.N * penPct / 100); }
  shuffle() {
    const c = this.cards, N = this.N;
    for (let i = 0; i < N; i++) c[i] = i % 52;
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const t = c[i]; c[i] = c[j]; c[j] = t; }
    this.pos = 0; this.rc = 0; this.seen = 0;
  }
  // 1枚引く（まだ見えていない）。山が尽きたら適当な1枚（1デッキを深く配ったときだけ起こる）
  draw() { return this.pos < this.N ? this.cards[this.pos++] : Math.floor(this.rng() * 52); }
  // 表になった札を数える
  see(id) { this.rc += HILO[cardValue(id)]; this.seen++; }
  drawSeen() { const id = this.draw(); this.see(id); return id; }
  get tc() { return trueCount(this.rc, this.N - this.seen); }
  get cardsLeft() { return this.N - this.pos; }
  get decksLeft() { return (this.N - this.pos) / 52; }
  needShuffle() { return this.pos >= this.cut; }
}
