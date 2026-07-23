# らっこアプリ — アプリ一覧ホームページ

個人開発の iOS アプリ（App Store 配信中）をまとめた、SEO 対応の静的ホームページ。
純粋な HTML/CSS/JS のみ。ビルドは Node（依存パッケージなし）。

## 構成

```
index.html            ← トップページ（build.mjs が生成。直接編集しない）
apps/<folder>/index.html ← アプリ個別ページ（1アプリ1ページ。build.mjs が生成）
index.template.html   ← トップの雛形（デザイン・文言はここを編集）
data/apps.js          ← 掲載アプリのデータ（★ここを編集してアプリを追加）
build.mjs             ← index.html・個別ページ・sitemap.xml を生成
css/tokens.css        ← 配色・フォント・余白などのデザイントークン
css/styles.css        ← レイアウト
js/app.js             ← カテゴリ絞り込み・検索・スクロール表示（段階的強化）
assets/icons/*.png    ← 各アプリのアイコン（256px。build時は使わず参照のみ）
assets/og/            ← OGP画像・apple-touch-icon
sitemap.xml robots.txt site.webmanifest favicon.svg
```

すべてのアプリカードは **index.html に静的に書き出される** ため、JavaScript を切っても検索エンジンにインデックスされる（JS は表示切替のみ）。

さらに **アプリ1本ごとに個別ページ** `apps/<folder>/`（例: `/apps/anakui/`）を生成する。各ページはアプリ名・ジャンルの検索受け皿になり（ロングテールSEO）、App Store への導線＋同ジャンルの関連アプリ＋構造化データ（SoftwareApplication／BreadcrumbList）を持つ。トップのカードはこの個別ページにリンクする。

## アプリを追加・更新する

1. アイコンを用意して `assets/icons/<folder>.png`（正方形・256px 目安）に置く。
   例: `sips -s format png -Z 256 元アイコン.png --out assets/icons/<folder>.png`
2. `data/apps.js` の `apps` 配列に 1 行足す（`cat` は `categories` の `key` と一致させる。非ゲームは `game:false`）。
3. 再生成:
   ```bash
   node build.mjs
   ```
4. 変更をコミットして公開（下記）。

## ローカルで確認

```bash
python3 -m http.server 5599 --directory .
# → http://localhost:5599
```

## 公開先

**https://rakkoapps.com**（独自ドメイン）を GitHub Pages（無料・HTTPS 無料）で配信。
リポジトリ: `rakko9924-tech/rakkoapps`。`main` に push すると自動で反映される。

`CNAME` ファイル（中身は `rakkoapps.com` の 1 行）が独自ドメイン指定。**消さないこと。**

### DNS 設定（ドメイン管理画面）

apex（rakkoapps.com）を GitHub Pages に向けるため A / AAAA レコードを設定する:

```
A     @   185.199.108.153
A     @   185.199.109.153
A     @   185.199.110.153
A     @   185.199.111.153
AAAA  @   2606:50c0:8000::153
AAAA  @   2606:50c0:8001::153
AAAA  @   2606:50c0:8002::153
AAAA  @   2606:50c0:8003::153
CNAME www rakko9924-tech.github.io.
```

設定後、GitHub の Settings → Pages で「Enforce HTTPS」を有効にする（証明書発行に最大 24 時間）。

## ★ 公開 URL を変えるとき（SEO 重要）

以下をまとめて書き換えて `node build.mjs` を実行:

- `build.mjs` の `const BASE = "..."`（canonical / OGP / JSON-LD / sitemap の絶対 URL に反映）
- `index.template.html` の `<link rel="canonical">` / `og:url` / OGP画像 URL
- `robots.txt` の `Sitemap:` 行
- `CNAME` ファイル（ドメイン名 1 行）

## SEO で入れてあるもの

- 日本語 `<title>` / meta description / keywords / canonical
- Open Graph・Twitter Card（OGP カバー画像付き）
- 構造化データ JSON-LD（`WebSite` / `Organization` / アプリ34件の `ItemList`＝各 `MobileApplication`/`SoftwareApplication`、価格0円）
- `sitemap.xml` / `robots.txt` / `site.webmanifest`
- 意味的な見出し階層（h1→h2→h3）・画像 alt・遅延読み込み・レスポンシブ
