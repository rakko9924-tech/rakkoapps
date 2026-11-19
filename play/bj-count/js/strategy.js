// 打ち方: 基本戦略の表と、カウントで変わる場面（インデックス）
// 表（chart）は tools/gen-strategy.mjs が作る。行は「相手の札 2,3,…,10,A」の順の文字列。
// シミュレータ（tools/sim/bjsim.c）の decide() と同じ順序・同じ条件で判定する。

export const UP_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
const ui = (up) => (up === 1 ? 9 : up - 2);

export const ACT_NAME = { H: 'ヒット', S: 'スタンド', D: 'ダブル', P: 'スプリット', R: 'サレンダー' };

// 値の配列（A=1、絵札=10）から手の情報を出す
export function handInfo(vals) {
  let t = 0, aces = 0;
  for (const v of vals) { t += v; if (v === 1) aces++; }
  const soft = aces > 0 && t + 10 <= 21;
  return { total: soft ? t + 10 : t, hard: t, soft, n: vals.length, pairVal: vals.length === 2 && vals[0] === vals[1] ? vals[0] : 0, bust: t > 21 };
}

export function hsAction(ch, total, soft, up) {
  const u = ui(up);
  if (soft) return total >= 19 ? 'S' : total <= 17 ? 'H' : (ch.standSoft[18][u] === '1' ? 'S' : 'H');
  return total >= 17 ? 'S' : total <= 11 ? 'H' : (ch.standHard[total][u] === '1' ? 'S' : 'H');
}

// can = { D, P, R }: いまダブル／スプリット／サレンダーができるか
export function baseAction(ch, info, up, can) {
  const u = ui(up);
  if (can.R) {
    if (info.pairVal) { if (ch.surPair && ch.surPair[info.pairVal] && ch.surPair[info.pairVal][u] === '1') return 'R'; }
    else if (!info.soft && ch.surHard && ch.surHard[info.total] && ch.surHard[info.total][u] === '1') return 'R';
  }
  if (info.pairVal) {
    if (can.P && ch.split[info.pairVal][u] === '1') return 'P';
    const a = ch.pairAlt[info.pairVal][u];
    if (a === 'D' && !can.D) return hsAction(ch, info.total, info.soft, up);
    return a;
  }
  if (can.D) {
    const row = info.soft ? ch.dblSoft[info.total] : ch.dblHard[info.total];
    if (row && row[u] === '1') return 'D';
  }
  return hsAction(ch, info.total, info.soft, up);
}

// インデックス（devs）を判定用の行に展開する。
//   N: この数未満ではサレンダーしない / K: この数未満ではダブルしない
const ORDER = { N: 0, K: 1, S: 2, H: 2, D: 3, P: 4, R: 5 };
export function devRows(devs) {
  const rows = [];
  for (const d of devs || []) {
    const b = { kind: d.kind, total: d.total, up: d.up, tc: d.idx, dev: d };
    if (d.hi === 'R') { rows.push({ ...b, ge: true, act: 'R' }); rows.push({ ...b, ge: false, act: 'N' }); }
    else if (d.hi === 'D') { rows.push({ ...b, ge: true, act: 'D' }); rows.push({ ...b, ge: false, act: 'K' }); }
    else if (d.hi === 'P') { rows.push({ ...b, ge: true, act: 'P' }); }
    else { rows.push({ ...b, ge: true, act: d.hi }); rows.push({ ...b, ge: false, act: d.lo }); }
  }
  // 安定ソート（同じ順位は元の並びのまま）
  return rows.map((r, i) => [r, i]).sort((a, b) => ORDER[a[0].act] - ORDER[b[0].act] || a[1] - b[1]).map(x => x[0]);
}

// 打ち方を決める。rows が null なら基本戦略だけ。
// 戻り値: { act, base, used }  used = 効いたインデックス（なければ null）
export function decide(ch, rows, info, up, tc, can) {
  const base = baseAction(ch, info, up, can);
  let act = base, used = null;
  if (!rows || !rows.length) return { act, base, used };
  const cells = [];
  if (info.pairVal) cells.push(['P', info.pairVal]);
  cells.push([info.soft ? 'S' : 'H', info.total]);
  for (const [kind, total] of cells) {
    for (const r of rows) {
      if (r.kind !== kind || r.total !== total || r.up !== up) continue;
      if (!(r.ge ? tc >= r.tc : tc < r.tc)) continue;
      const before = act;
      switch (r.act) {
        case 'N': if (act === 'R') act = baseAction(ch, info, up, { ...can, R: false }); break;
        case 'K': if (act === 'D') act = hsAction(ch, info.total, info.soft, up); break;
        case 'S': case 'H': if (act === 'H' || act === 'S') act = r.act; break;
        case 'D': if (can.D && (act === 'H' || act === 'S')) act = 'D'; break;
        case 'P': if (can.P && act !== 'R') act = 'P'; break;
        case 'R': if (can.R && act !== 'P') act = 'R'; break;
      }
      if (act !== before) used = r.dev;
    }
  }
  // 基本戦略と同じ結果なら、インデックスが「効いた」とは言わない
  if (act === base) used = null;
  return { act, base, used };
}

// この場面に関係するインデックス（解説用）
export function devFor(devs, info, up) {
  const out = [];
  for (const d of devs || []) {
    if (d.up !== up) continue;
    if (d.kind === 'P' ? info.pairVal === d.total : (!info.pairVal || true) && d.kind === (info.soft ? 'S' : 'H') && info.total === d.total) out.push(d);
  }
  return out;
}

// 最初の2枚の表（人が読む形）。セルは H / S / D / Ds / P / R / Rs / Rp
export function chartCell(ch, kind, key, up) {
  const u = ui(up);
  if (kind === 'pair') {
    const p = key;
    const sur = ch.surPair && ch.surPair[p] && ch.surPair[p][u] === '1';
    const sp = ch.split[p][u] === '1';
    if (sur) return sp ? 'Rp' : 'R';
    if (sp) return 'P';
    return ch.pairAlt[p][u];
  }
  if (kind === 'soft') {
    const st = hsAction(ch, key, true, up) === 'S';
    if (ch.dblSoft[key] && ch.dblSoft[key][u] === '1') return st ? 'Ds' : 'D';
    return st ? 'S' : 'H';
  }
  const st = hsAction(ch, key, false, up) === 'S';
  if (ch.surHard && ch.surHard[key] && ch.surHard[key][u] === '1') return st ? 'Rs' : 'R';
  if (ch.dblHard[key] && ch.dblHard[key][u] === '1') return 'D';
  return st ? 'S' : 'H';
}

export function upLabel(up) { return up === 1 ? 'A' : String(up); }

// インデックスを言葉にする
export function devText(d) {
  const hand = d.kind === 'P' ? `${d.total === 10 ? '10' : d.total}のペア` : d.kind === 'S' ? `ソフト${d.total}` : `${d.total}`;
  const sign = d.idx > 0 ? `+${d.idx}` : d.idx < 0 ? `−${-d.idx}` : '0';
  const lo = d.lo === 'X' ? 'サレンダーしない' : ACT_NAME[d.lo];
  return `${hand} 対 ${upLabel(d.up)}：${sign} 以上で${ACT_NAME[d.hi]}、未満は${lo}`;
}
