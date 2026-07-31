// らっこアプリ サイトビルダー
//   node build.mjs
// index.template.html + data/apps.js から:
//   - index.html（トップ）
//   - apps/<folder>/index.html（アプリ個別ページ・1アプリ1ページ）
//   - sitemap.xml
// を生成する。
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { apps, categories } from "./data/apps.js";

const __dir = dirname(fileURLToPath(import.meta.url));

// ▼ SITE URL — サイトの公開URL（変更時は robots.txt と index.template.html の canonical/OGP も）
const BASE = "https://rakkoapps.com";
const TODAY = "2026-07-24";

// CSS/JS のキャッシュ対策。更新しても古いスタイルが表示され続けないよう ?v= を付ける。
const assetVer = (() => {
  const t = ["css/tokens.css", "css/styles.css", "js/app.js"].map((f) => {
    try { return statSync(join(__dir, f)).mtimeMs; } catch { return 0; }
  });
  return Math.floor(Math.max(...t)).toString(36);
})();
const CSS_TOKENS = `/css/tokens.css?v=${assetVer}`;
const CSS_STYLES = `/css/styles.css?v=${assetVer}`;
const JS_APP = `/js/app.js?v=${assetVer}`;

const catMap = Object.fromEntries(categories.map((c) => [c.key, c]));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const storeUrl = (id) => `https://apps.apple.com/jp/app/id${id}`;
const iconPath = (folder) => `/assets/icons/${folder}.png`;
const iconAbs = (folder) => `${BASE}${iconPath(folder)}`;
const detailPath = (folder) => `/apps/${folder}/`;
const detailAbs = (folder) => `${BASE}${detailPath(folder)}`;
// `play` を持つアプリは iOS 版が無い Web 専用（導線はブラウザで遊ぶリンクのみ）。
const isWeb = (app) => !!app.play;
const playAbs = (app) => `${BASE}${app.play}`;
const appType = (app) => (isWeb(app) ? "WebApplication" : app.game ? "MobileApplication" : "SoftwareApplication");
const appCat = (app) => (app.game ? "GameApplication" : "UtilitiesApplication");
const appOs = (app) => (isWeb(app) ? "Web browser" : "iOS");
// 入手先。Web専用はプレイURL、それ以外は App Store。
const getUrl = (app) => (isWeb(app) ? playAbs(app) : storeUrl(app.id));

const arrow = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const arrowBtn = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function cardHtml(app, { featured = false } = {}) {
  const c = catMap[app.cat];
  const search = [app.name, app.folder, c.label, c.tag, app.kw, app.desc, isWeb(app) && "ブラウザ Web ウェブ"].filter(Boolean).join(" ");
  const badge = featured ? `<span class="badge-featured">注目</span>` : "";
  return `        <article class="app-card" data-cat="${app.cat}" data-search="${esc(search)}">
          ${badge}
          <div class="app-card__icon"><img src="${iconPath(app.folder)}" width="256" height="256" loading="lazy" decoding="async" alt="${esc(app.name)}のアプリアイコン"></div>
          <div class="app-card__body">
            <h3 class="app-card__name"><a href="${detailPath(app.folder)}">${esc(app.name)}</a></h3>
            <p class="app-card__desc">${esc(app.desc)}</p>
            <div class="app-card__meta">
              <span class="tag"><span class="tag__dot" style="--tag-hue:var(${c.dot})"></span>${esc(c.tag)}</span>${isWeb(app) ? `\n              <span class="tag tag--web">ブラウザで遊べる</span>` : ""}
              <span class="app-card__go">くわしく ${arrow}</span>
            </div>
          </div>
        </article>`;
}

// ---- counts per category ----
const counts = Object.fromEntries(categories.map((c) => [c.key, 0]));
for (const a of apps) counts[a.cat]++;
const activeCats = categories.filter((c) => counts[c.key] > 0);

// ---- chips ----
const chipsHtml = [
  `          <button class="chip" type="button" data-filter="all" aria-pressed="true">すべて <span class="chip__count">${apps.length}</span></button>`,
  ...activeCats.map(
    (c) =>
      `          <button class="chip" type="button" data-filter="${c.key}" aria-pressed="false"><span class="tag__dot" style="--tag-hue:var(${c.dot})"></span>${esc(c.label)} <span class="chip__count">${counts[c.key]}</span></button>`
  ),
].join("\n");

const featuredHtml = apps.filter((a) => a.featured).map((a) => cardHtml(a, { featured: true })).join("\n");
const cardsHtml = apps.map((a) => cardHtml(a)).join("\n");

// ============ トップページ JSON-LD ============
const homeJsonld = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${BASE}/#website`, url: `${BASE}/`, name: "らっこアプリ", description: "個人開発の無料iPhoneゲーム・便利アプリまとめ", inLanguage: "ja", publisher: { "@id": `${BASE}/#publisher` } },
    { "@type": "Organization", "@id": `${BASE}/#publisher`, name: "らっこアプリ", url: `${BASE}/`, email: "rakko9924@gmail.com", logo: `${BASE}/assets/og/apple-touch-icon.png` },
    {
      "@type": "ItemList",
      name: "らっこアプリ 配信中アプリ一覧",
      description: "App Storeで配信中のiPhoneアプリ一覧",
      numberOfItems: apps.length,
      itemListElement: apps.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: detailAbs(a.folder),
        item: {
          "@type": appType(a),
          name: a.name,
          url: detailAbs(a.folder),
          ...(isWeb(a) ? { installUrl: playAbs(a) } : { downloadUrl: storeUrl(a.id) }),
          image: iconAbs(a.folder),
          operatingSystem: appOs(a),
          applicationCategory: appCat(a),
          offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
        },
      })),
    },
  ],
};

// ============ 共有パーツ（個別ページ用の nav / footer） ============
const navHtml = `<header class="nav">
  <div class="wrap nav__inner">
    <a class="wordmark" href="/" aria-label="らっこアプリ ホーム">
      <img class="wordmark__mark" src="/assets/brand/icon-96.png" width="96" height="96" alt="" aria-hidden="true">
      らっこアプリ
    </a>
    <nav class="nav__links" aria-label="メイン">
      <a class="nav__link" href="/#featured">注目</a>
      <a class="nav__link" href="/#apps">アプリ一覧</a>
      <a class="nav__link" href="/#about">このサイトについて</a>
      <a class="nav__link nav__cta btn btn--ghost" href="/#apps">探す</a>
    </nav>
  </div>
</header>`;

const footerHtml = `<footer class="footer">
  <div class="wrap">
    <p class="footer__statement">つくって、公開して、また next。<br>らっこアプリ。</p>
    <div class="footer__row">
      <nav class="footer__links" aria-label="フッター">
        <a href="/#featured">注目のアプリ</a>
        <a href="/#apps">アプリ一覧</a>
        <a href="/#about">このサイトについて</a>
        <a href="mailto:rakko9924@gmail.com">お問い合わせ</a>
      </nav>
      <p class="footer__copy">© 2026 らっこアプリ</p>
    </div>
  </div>
</footer>`;

// ============ アプリ個別ページ ============
function relatedHtml(app) {
  const rel = apps.filter((a) => a.cat === app.cat && a.folder !== app.folder).slice(0, 4);
  if (rel.length === 0) return "";
  return `  <section class="section section--tint">
    <div class="wrap">
      <header class="section__head">
        <p class="section__eyebrow">同じジャンル</p>
        <h2 class="section__title">${esc(catMap[app.cat].label)}のアプリ</h2>
      </header>
      <div class="app-grid">
${rel.map((a) => cardHtml(a)).join("\n")}
      </div>
    </div>
  </section>`;
}

function detailPage(app) {
  const c = catMap[app.cat];
  const kind = app.game ? "ゲーム" : "アプリ";
  const web = isWeb(app);
  const headline = web ? `${c.label}のブラウザ無料${kind}` : `${c.label}の無料iPhone${kind}`;
  const title = `${app.name}｜${headline} - らっこアプリ`;
  const metaDesc = web
    ? `${app.desc} インストール不要、ブラウザですぐ無料で遊べます。${app.name}は個人開発のWeb${kind}（らっこアプリ）。`
    : `${app.desc} iPhoneで無料でダウンロードできます。${app.name}は個人開発のiOS${kind}（らっこアプリ）。`;
  const url = detailAbs(app.folder);
  const img = iconAbs(app.folder);

  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": appType(app),
        name: app.name,
        description: app.desc,
        image: img,
        url,
        ...(web
          ? { installUrl: playAbs(app), browserRequirements: "JavaScript が有効なモダンブラウザ" }
          : { downloadUrl: storeUrl(app.id) }),
        operatingSystem: appOs(app),
        applicationCategory: appCat(app),
        inLanguage: "ja",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
        publisher: { "@type": "Organization", name: "らっこアプリ", url: `${BASE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "らっこアプリ", item: `${BASE}/` },
          { "@type": "ListItem", position: 2, name: c.label, item: `${BASE}/#apps` },
          { "@type": "ListItem", position: 3, name: app.name, item: url },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#f2694b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="らっこアプリ">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(app.name)}｜${esc(headline)}">
<meta property="og:description" content="${esc(app.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(app.name)}｜らっこアプリ">
<meta name="twitter:description" content="${esc(app.desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/og/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${CSS_TOKENS}">
<link rel="stylesheet" href="${CSS_STYLES}">
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
</head>
<body>
<a class="skip" href="#main">本文へスキップ</a>
${navHtml}
<main id="main">
  <div class="wrap">
    <nav class="breadcrumb" aria-label="パンくず">
      <a href="/">らっこアプリ</a> <span aria-hidden="true">›</span>
      <a href="/#apps">${esc(c.label)}</a> <span aria-hidden="true">›</span>
      <span aria-current="page">${esc(app.name)}</span>
    </nav>

    <article class="detail-hero">
      <div class="detail-hero__icon"><img src="${iconPath(app.folder)}" width="256" height="256" alt="${esc(app.name)}のアプリアイコン"></div>
      <div class="detail-hero__body">
        <span class="tag detail-hero__cat"><span class="tag__dot" style="--tag-hue:var(${c.dot})"></span>${esc(c.label)}</span>
        <h1>${esc(app.name)}</h1>
        <p class="detail-hero__lead">${esc(app.desc)}</p>
        <div class="detail-cta">
          <a class="btn btn--primary btn--lg" href="${getUrl(app)}"${web ? "" : ' target="_blank" rel="noopener"'}>${web ? "ブラウザで遊ぶ（無料）" : "App Storeで入手（無料）"}${arrowBtn}</a>
        </div>
        <p class="detail-cta__note">${web ? "インストール不要・無料（スマホ／PCのブラウザで遊べます）" : "iPhone対応・ダウンロード無料（一部アプリ内課金がある場合があります）"}</p>
      </div>
    </article>

    <section class="detail-body">
      <div class="detail-prose">
        <h2>${esc(app.name)}ってどんな${kind}？</h2>
        <p>${esc(app.name)}は、${esc(c.label)}の${kind}です。${esc(app.desc)}${web ? "インストール不要で、スマホでもPCでもブラウザを開くだけで無料で遊べます。" : "iPhoneに対応し、App Storeから無料でダウンロードできます。"}</p>
      </div>
      <aside class="detail-facts">
        <dl>
          <div><dt>ジャンル</dt><dd>${esc(c.label)}</dd></div>
          <div><dt>対応</dt><dd>${web ? "ブラウザ（スマホ／PC）" : "iPhone（iOS）"}</dd></div>
          <div><dt>価格</dt><dd>無料</dd></div>
          <div><dt>配信</dt><dd>${web ? `<a href="${app.play}">ブラウザで遊ぶ</a>` : `<a href="${storeUrl(app.id)}" target="_blank" rel="noopener">App Store</a>`}</dd></div>
        </dl>
      </aside>
    </section>

    <p class="detail-back"><a href="/#apps">← アプリ一覧にもどる</a></p>
  </div>

${relatedHtml(app)}
</main>
${footerHtml}
</body>
</html>
`;
}

// ============ 生成 ============
// トップページ
let html = readFileSync(join(__dir, "index.template.html"), "utf8");
html = html
  .replaceAll("{{APP_COUNT}}", String(apps.length))
  .replaceAll("{{CAT_COUNT}}", String(activeCats.length))
  .replace("<!-- JSONLD -->", `<script type="application/ld+json">\n${JSON.stringify(homeJsonld, null, 2)}\n</script>`)
  .replace("<!-- CHIPS -->", chipsHtml.trimStart())
  .replace("<!-- FEATURED -->", featuredHtml.trimStart())
  .replace("<!-- CARDS -->", cardsHtml.trimStart())
  .replaceAll("/css/tokens.css", CSS_TOKENS)
  .replaceAll("/css/styles.css", CSS_STYLES)
  .replaceAll("/js/app.js", JS_APP);
writeFileSync(join(__dir, "index.html"), html);

// 個別ページ
for (const app of apps) {
  const dir = join(__dir, "apps", app.folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), detailPage(app));
}

// sitemap（トップ + 全個別ページ）
const urls = [`${BASE}/`, ...apps.map((a) => detailAbs(a.folder)), ...apps.filter(isWeb).map(playAbs)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u, i) => `  <url>
    <loc>${u}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${i === 0 ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(join(__dir, "sitemap.xml"), sitemap);

console.log(`built top + ${apps.length} app pages, ${activeCats.length} categories, ${apps.filter((a) => a.featured).length} featured, sitemap ${urls.length} URLs`);
