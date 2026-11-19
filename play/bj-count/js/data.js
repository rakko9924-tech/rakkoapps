// 表の読み込み（基本戦略の表と、カウント別の期待値の表）
const cache = new Map();
let strategyPromise = null;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`読み込めませんでした: ${url} (${res.status})`);
  return res.json();
}

export function loadStrategy(base = './data/') {
  if (!strategyPromise) strategyPromise = getJson(`${base}strategy.json`).catch((e) => { strategyPromise = null; throw e; });
  return strategyPromise;
}

export function loadTable(key, base = './data/') {
  if (!cache.has(key)) cache.set(key, getJson(`${base}tables/${key}.json`).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

// ルール一式を読み込む: { chart, table }
export async function loadRuleData(key, base = './data/') {
  const [strategy, table] = await Promise.all([loadStrategy(base), loadTable(key, base)]);
  return { chart: strategy[key], table };
}
