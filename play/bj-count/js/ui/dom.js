// 画面づくりの小道具
import { cardLabel, cardSuit, isRed, tagOf } from '../cards.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
function setProps(el, props, svg) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (!svg && k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}
export function h(tag, props, ...kids) { const el = document.createElement(tag); setProps(el, props, false); append(el, kids); return el; }
export function s(tag, props, ...kids) { const el = document.createElementNS(SVGNS, tag); setProps(el, props, true); append(el, kids); return el; }

export const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const pts = (n) => [fmt(n), h('small', null, '点')];

// 手描きの線アイコン（太さと丸みをそろえる）
const ICONS = {
  back: 'M15 5 L8 12 L15 19',
  next: 'M9 5 L16 12 L9 19',
  sliders: 'M4 7 H14 M18 7 H20 M4 17 H8 M12 17 H20 M16 4.5 V9.5 M10 14.5 V19.5',
  sound: 'M4 10 V14 H8 L13 18 V6 L8 10 Z M16.5 9 C18 10.5 18 13.5 16.5 15 M19 6.5 C22 9.5 22 14.5 19 17.5',
  mute: 'M4 10 V14 H8 L13 18 V6 L8 10 Z M17 9.5 L21 14.5 M21 9.5 L17 14.5',
  redo: 'M5 12 A7 7 0 1 1 8 17.5 M5 12 V7 M5 12 H10',
  eye: 'M2.5 12 C5.5 6.5 18.5 6.5 21.5 12 C18.5 17.5 5.5 17.5 2.5 12 Z M12 9.5 A2.5 2.5 0 1 1 12 14.5 A2.5 2.5 0 1 1 12 9.5',
};
export function icon(name) {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s('path', { d: ICONS[name] }));
}

// 赤ペンの印: 丸（正解）・三角（惜しい）・バツ（不正解）
const MARKS = {
  ok: ['M31 9 C16 6 6 18 7 32 C8 47 20 57 34 55 C49 53 58 41 56 27 C54 14 43 6 27 10'],
  near: ['M32 9 L55 51 L9 52 L33 8'],
  ng: ['M14 13 C24 24 39 39 51 51', 'M51 13 C40 24 25 40 13 52'],
};
export function markSvg(kind, cls = 'verdict__mark') {
  return s('svg', { class: cls, viewBox: '0 0 64 64', role: 'img', 'aria-label': kind === 'ok' ? '正解' : kind === 'near' ? '惜しい' : '不正解' },
    MARKS[kind].map(d => s('path', { d, pathLength: '1' })));
}
// 進み具合の小さな印
export function progMarks(results, total) {
  const wrap = h('div', { class: 'prog__marks', 'aria-hidden': 'true' });
  for (let i = 0; i < total; i++) {
    const r = results[i];
    const svg = s('svg', { class: 'prog__mark', viewBox: '0 0 16 16', 'data-r': r || '' });
    if (r === 'ng') svg.append(s('path', { d: 'M3 3 L13 13 M13 3 L3 13' }));
    else if (r === 'near') svg.append(s('path', { d: 'M8 2.5 L14 13 L2 13 Z' }));
    else svg.append(s('circle', { cx: 8, cy: 8, r: 5.5 }));
    wrap.append(svg);
  }
  return wrap;
}

// 丸つけの1行
export function verdict(kind, text, sub) {
  return h('div', { class: 'verdict', role: 'status' }, markSvg(kind), h('div', { class: 'verdict__text' }, text, sub ? h('small', null, sub) : null));
}

// 札
const SUIT_PATH = [
  'M12 2 C8 7 3 10 3 14.5 C3 17.5 5.2 19.5 7.8 19.5 C9.3 19.5 10.5 18.9 11.3 17.9 C11 19.8 10.2 21.2 9 22 L15 22 C13.8 21.2 13 19.8 12.7 17.9 C13.5 18.9 14.7 19.5 16.2 19.5 C18.8 19.5 21 17.5 21 14.5 C21 10 16 7 12 2 Z',
  'M12 21 C6 16 2.5 12.5 2.5 8.5 C2.5 5.5 4.8 3.5 7.4 3.5 C9.3 3.5 11 4.6 12 6.2 C13 4.6 14.7 3.5 16.6 3.5 C19.2 3.5 21.5 5.5 21.5 8.5 C21.5 12.5 18 16 12 21 Z',
  'M12 2 L20 12 L12 22 L4 12 Z',
  'M12 2.5 A4.3 4.3 0 0 1 15.9 8.9 A4.3 4.3 0 1 1 13 16.4 C13.3 18.6 14 20.6 15.2 22 L8.8 22 C10 20.6 10.7 18.6 11 16.4 A4.3 4.3 0 1 1 8.1 8.9 A4.3 4.3 0 0 1 12 2.5 Z',
];
const SUIT_NAME = ['スペード', 'ハート', 'ダイヤ', 'クラブ'];
const suitSvg = (su) => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: SUIT_PATH[su] }));

export function cardEl(id, { size = '', down = false, tag = false, animate = false } = {}) {
  const cls = ['card', size && `card--${size}`, animate && 'is-in'].filter(Boolean);
  if (down) return h('div', { class: [...cls, 'card--down'].join(' '), role: 'img', 'aria-label': '伏せた札' });
  const su = cardSuit(id);
  if (isRed(id)) cls.push('card--red');
  const el = h('div', { class: cls.join(' '), role: 'img', 'aria-label': `${SUIT_NAME[su]}の${cardLabel(id)}` },
    h('span', { class: 'card__rank' }, cardLabel(id)),
    h('span', { class: 'card__pip' }, suitSvg(su)),
    h('span', { class: 'card__big' }, suitSvg(su)));
  if (tag) el.append(h('span', { class: 'card__tag' }, signed(tagOf(id))));
  return el;
}

// ページの柱（上端）
export function pageHead({ chapter, title, tool }) {
  return h('header', { class: 'head' },
    h('a', { class: 'head__back', href: '#/', 'aria-label': '目次へ戻る' }, icon('back'), '目次'),
    h('h1', { class: 'head__title' }, chapter ? h('small', null, chapter) : null, title),
    tool || h('a', { class: 'head__tool', href: '#/settings', 'aria-label': '条件を変える' }, icon('sliders'), '条件'));
}

// 切り替え（セグメント）
export function seg(options, value, onChange, { wrap = false, label } = {}) {
  const el = h('div', { class: wrap ? 'seg seg--wrap' : 'seg', role: 'group', 'aria-label': label || null });
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), disabled: !!o.disabled, onclick: () => { if (o.value === cur) return; cur = o.value; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(options[i].value === cur))); onChange(cur); } }, o.label);
    return b;
  });
  let cur = value;
  el.append(...btns);
  return el;
}

// テンキー（符号つき整数）
export function numberPad({ onSubmit, unit = '', okLabel = '答え合わせ' }) {
  let str = '', neg = false;
  const out = h('div', { class: 'readout readout--empty', 'aria-live': 'polite' }, '?');
  const value = () => (str === '' ? null : (neg ? -1 : 1) * parseInt(str, 10) || 0);
  const paint = () => {
    const v = value();
    out.classList.toggle('readout--empty', v === null && !neg);
    out.replaceChildren(v === null ? (neg ? '−' : '?') : signed(v), unit ? h('small', null, unit) : '');
    ok.disabled = v === null;
  };
  const key = (label, fn, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, onclick: () => { fn(); paint(); } }, label);
  const digit = (d) => key(String(d), () => { if (str.length < 3) str = str === '0' ? String(d) : str + d; });
  const ok = h('button', { type: 'button', class: 'btn btn--primary btn--word pad__ok', disabled: true, onclick: () => { const v = value(); if (v !== null) onSubmit(v); } }, okLabel);
  const pad = h('div', { class: 'pad' },
    digit(1), digit(2), digit(3), key('⌫', () => { if (str) str = str.slice(0, -1); else neg = false; }, 'btn--word'),
    digit(4), digit(5), digit(6), key('+/−', () => { neg = !neg; }, 'btn--word'),
    digit(7), digit(8), digit(9), ok,
    h('span'), digit(0), h('span'));
  const el = h('div', { class: 'stack' }, out, pad);
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { if (str.length < 3) str = str === '0' ? e.key : str + e.key; paint(); }
    else if (e.key === '-') { neg = !neg; paint(); }
    else if (e.key === 'Backspace') { if (str) str = str.slice(0, -1); else neg = false; paint(); }
    else if (e.key === 'Enter') { const v = value(); if (v !== null) { e.preventDefault(); onSubmit(v); } }
  };
  document.addEventListener('keydown', onKey);
  return { el, destroy: () => document.removeEventListener('keydown', onKey), lock: () => { pad.querySelectorAll('button').forEach(b => { b.disabled = true; }); document.removeEventListener('keydown', onKey); } };
}

// 数直線で賭け金を選ぶ
export function betLine({ money, value, onChange }) {
  const { min, max, step } = money;
  const n = Math.round((max - min) / step);
  const W = 320, PADX = 20, Y = 46, x = (v) => PADX + ((v - min) / Math.max(1, max - min)) * (W - 2 * PADX);
  let cur = Math.min(max, Math.max(min, value ?? min)), locked = false;
  const svg = s('svg', { viewBox: `0 0 ${W} 76`, role: 'slider', tabindex: '0', 'aria-label': '賭け金', 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': cur, 'aria-valuetext': `${fmt(cur)}点` });
  svg.append(s('path', { class: 'nl__axis', d: `M${PADX - 6} ${Y} H${W - PADX + 6}` }));
  // 数字を書く目盛り: 最低ベットから「きりのよい間隔」ごと（最大の近くは最大だけ）。その半分の位置も長い目盛り
  const span = Math.max(step, max - min), want = span / 4.5, pow = 10 ** Math.floor(Math.log10(want));
  let lab = [1, 2, 2.5, 5, 10].map(k => k * pow).find(v => v >= want) || span;
  lab = Math.max(step, Math.round(lab / step) * step);
  const labels = new Set([min, max]);
  for (let v = min + lab; v < max - lab * 0.6; v += lab) labels.add(v);
  const half = lab / 2, halfOn = half >= step && half % step === 0;
  const every = n <= 24 ? 1 : Math.ceil(n / 24);
  for (let i = 0; i <= n; i++) {
    const v = min + i * step, isLab = labels.has(v), major = isLab || (halfOn && (v - min) % half === 0);
    if (i % every !== 0 && !major) continue;
    svg.append(s('line', { class: major ? 'nl__tick nl__tick--major' : 'nl__tick', x1: x(v), x2: x(v), y1: Y - (major ? 8 : 5), y2: Y + (major ? 8 : 5) }));
    if (isLab) svg.append(s('text', { class: 'nl__label', x: x(v), y: Y + 24 }, fmt(v)));
  }
  const right = s('g', { hidden: true });
  const knob = s('g', null, s('line', { class: 'nl__stem', x1: 0, x2: 0, y1: Y - 20, y2: Y }), s('circle', { class: 'nl__knob', cx: 0, cy: Y - 24, r: 7 }), s('circle', { class: 'nl__knob', cx: 0, cy: Y, r: 3.5 }));
  svg.append(right, knob, s('rect', { class: 'nl__hit', x: 0, y: 0, width: W, height: 76 }));
  const paint = () => { knob.setAttribute('transform', `translate(${x(cur)} 0)`); svg.setAttribute('aria-valuenow', cur); svg.setAttribute('aria-valuetext', `${fmt(cur)}点`); };
  const set = (v, silent) => { v = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step)); if (v === cur) return; cur = v; paint(); if (!silent) onChange(cur); };
  const fromEvent = (e) => { const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; set(min + ((px - PADX) / (W - 2 * PADX)) * (max - min)); };
  let drag = false;
  svg.addEventListener('pointerdown', (e) => { if (locked) return; drag = true; svg.setPointerCapture(e.pointerId); fromEvent(e); });
  svg.addEventListener('pointermove', (e) => { if (drag && !locked) fromEvent(e); });
  const end = () => { drag = false; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    if (locked) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(cur + step); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(cur - step); e.preventDefault(); }
    else if (e.key === 'Home') { set(min); e.preventDefault(); } else if (e.key === 'End') { set(max); e.preventDefault(); }
  });
  paint();
  const el = h('div', { class: 'nl' }, svg);
  return {
    el, get value() { return cur; }, set: (v) => set(v), nudge: (d) => { if (!locked) set(cur + d * step); },
    // 答え合わせ: 正解の位置に赤で印をつけ、動かせなくする
    reveal(ans) {
      locked = true; svg.setAttribute('aria-disabled', 'true'); svg.removeAttribute('tabindex');
      right.replaceChildren(s('path', { class: 'nl__right', d: `M${x(ans) - 7} ${Y - 9} L${x(ans)} ${Y - 1} L${x(ans) + 9} ${Y - 15}` }), s('text', { class: 'nl__rightlabel', x: W - PADX + 6, y: 12, 'text-anchor': 'end' }, `正解 ${fmt(ans)}点`));
      right.removeAttribute('hidden');
    },
  };
}

// 捨て札置き場の図（残りデッキを目で読む）。dealt = 捨て札のデッキ数
export function trayFig(decks, dealt, { showNumbers = false } = {}) {
  const unit = Math.min(44, 140 / decks);            // 1デッキぶんの厚み
  const W = 320, top = 16, base = top + unit * decks + 6, H = base + 26, left = 100;
  const hStack = unit * dealt;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': showNumbers ? `捨て札 ${dealt} デッキ` : `捨て札置き場の図（配り終えた札。${decks}デッキの卓）` });
  // 置き場（横から見た図）
  svg.append(s('path', { class: 'tray__box', d: `M${left} ${top - 4} V${base} H${left + 150} V${top - 4}` }));
  // 捨て札の山
  if (hStack > 0) {
    svg.append(s('rect', { class: 'tray__stack', x: left + 6, y: base - hStack, width: 138, height: hStack }));
    for (let yy = base - 2.2; yy > base - hStack + 1; yy -= 2.2) svg.append(s('line', { class: 'tray__edge', x1: left + 6, x2: left + 144, y1: yy, y2: yy }));
  }
  // デッキの目盛り（置き場の横）。半デッキにも目盛り。間が広いとき（1〜2デッキ）は半デッキの数字も左に、
  // 狭いとき（6〜8デッキ）は半デッキの数字を置き場の右側に小さく書く（左の数字と重ならないように）
  const sub = decks === 1 ? 4 : 2, halfLeft = unit / 2 >= 16, halfRight = !halfLeft && unit / 2 >= 9;
  for (let i = 0; i <= decks * sub; i++) {
    const y = base - (unit * i) / sub, whole = i % sub === 0, halfMark = sub === 2 || i % 2 === 0;
    svg.append(s('line', { class: whole ? 'tray__mark tray__mark--whole' : 'tray__mark', x1: left - (whole ? 11 : halfMark ? 8 : 5), x2: left - 1, y1: y, y2: y }));
    if (whole || (halfLeft && halfMark)) svg.append(s('text', { class: 'tray__text', x: left - 15, y: y + 4.5, 'text-anchor': 'end' }, String(i / sub)));
    else if (halfRight && halfMark && !showNumbers) {
      svg.append(s('line', { class: 'tray__mark', x1: left + 151, x2: left + 157, y1: y, y2: y }));
      svg.append(s('text', { class: 'tray__half', x: left + 161, y: y + 4 }, String(i / sub)));
    }
  }
  svg.append(s('text', { class: 'tray__text', x: left - 46, y: (top + base) / 2 + 4, 'text-anchor': 'end' }, 'デッキ'));
  svg.append(s('text', { class: 'tray__text', x: left + 75, y: base + 18, 'text-anchor': 'middle' }, `捨て札置き場（配り終えた札・${decks}デッキの卓）`));
  if (showNumbers) svg.append(s('text', { class: 'tray__text tray__text--ink', x: left + 156, y: base - hStack + 5 }, `← ${dealt}`));
  return h('div', { class: 'tray' }, svg);
}

// 下から出る紙
export function sheet(title, body, { onClose } = {}) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); prev && prev.focus && prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const prev = document.activeElement;
  const card = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', { class: 'sheet__title' }, title), body);
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, card);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  const first = card.querySelector('textarea, input, button');
  if (first) first.focus({ preventScroll: true });
  return { close, el: card };
}
