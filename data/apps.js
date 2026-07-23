// らっこアプリ — 掲載アプリのデータ（配信中のみ）
// 新しいアプリを追加/更新したら `node build.mjs` を実行してサイトを再生成する。
// cat のキーは categories の key と一致させること。featured:true で「注目」枠に表示。
// 導線は App Store のみ（Web版へのリンクは置かない）。

export const categories = [
  { key: "online",  label: "オンライン対戦",   tag: "オンライン対戦", dot: "--cat-online" },
  { key: "action",  label: "アクション",       tag: "アクション",     dot: "--cat-action" },
  { key: "puzzle",  label: "パズル・脱出",     tag: "パズル",         dot: "--cat-puzzle" },
  { key: "sim",     label: "育成・戦略",       tag: "育成・戦略",     dot: "--cat-sim" },
  { key: "party",   label: "パーティー・推理", tag: "パーティー",     dot: "--cat-card" },
  { key: "casual",  label: "カジュアル・放置", tag: "カジュアル",     dot: "--cat-casual" },
  { key: "utility", label: "実用・ツール",     tag: "ツール",         dot: "--cat-utility" },
];

// id = App Store の数値ID。game=false のものは非ゲーム（構造化データで区別）。
export const apps = [
  // ---- オンライン対戦 ----
  { folder: "anakui",          name: "穴喰いバトル",             id: "6790614376", cat: "online",  game: true,  featured: true,  desc: "街ごと吸い込む「穴」になって競うオンライン対戦。", kw: "hole.io ホール 穴 対戦" },
  { folder: "orochi-battle",   name: "大蛇バトル",               id: "6790615872", cat: "online",  game: true,  featured: false, desc: "玉を食べて大蛇を育て、相手を狩るオンライン対戦。", kw: "slither スリザリオ ヘビ 蛇" },
  { folder: "oekaki-online",   name: "らくがきオンライン",       id: "6783932279", cat: "online",  game: true,  featured: false, desc: "みんなで遊ぶリアルタイムお絵かき当てゲーム。", kw: "お絵かきの森 drawing お絵描き" },
  { folder: "super-tap-battle",name: "スーパータップ対戦",       id: "6784173258", cat: "online",  game: true,  featured: false, desc: "現れるボールを割るだけ。超シンプル早押し対戦。", kw: "タップ 早押し reaction" },
  { folder: "issen",           name: "ISSEN 一閃",               id: "6781177113", cat: "online",  game: true,  featured: false, desc: "コンマ数秒の反応速度を競う早撃ちオンライン対戦。", kw: "居合 早撃ち reaction 反射" },
  { folder: "PineappleOFC",    name: "チャイポオンライン",       id: "6781688872", cat: "online",  game: true,  featured: false, desc: "十三張パイナップルOFCをオンラインで手軽に。", kw: "OFC ポーカー poker pineapple チャイニーズ" },

  // ---- アクション ----
  { folder: "pika-tensei",     name: "ピカピカ転生",             id: "6793157994", cat: "action",  game: true,  featured: true,  desc: "指でこする物理演算のおそうじ×転生ゲーム。", kw: "掃除 そうじ こすり ASMR 転生" },
  { folder: "hero30",          name: "30秒の勇者",               id: "6784219090", cat: "action",  game: true,  featured: false, desc: "制限時間30秒で魔王を討つドット絵スピードRPG。", kw: "RPG 勇者 魔王 ドット" },
  { folder: "dekoboko-rider",  name: "デコボコライダー",         id: "6785051153", cat: "action",  game: true,  featured: false, desc: "バイクで丘を駆け抜けるかんたん物理アクション。", kw: "バイク 物理 happy wheels レース" },
  { folder: "rakugaki-oukoku", name: "おえかきモンスターバトル", id: "6784171825", cat: "action",  game: true,  featured: false, desc: "描いた絵が3Dモンスターになって戦う。", kw: "お絵かき モンスター バトル 落書き" },

  // ---- パズル・脱出 ----
  { folder: "escape-room",     name: "密室100",                  id: "6785661257", cat: "puzzle",  game: true,  featured: true,  desc: "100室すべてが別コンセプトの本格脱出ゲーム。", kw: "脱出 escape 謎解き 密室" },
  { folder: "aqualux",         name: "AQUALUX",                  id: "6780931848", cat: "puzzle",  game: true,  featured: false, desc: "色の水をびんに仕分ける爽快ソートパズル。", kw: "water sort 水 仕分け パズル" },
  { folder: "quadle",          name: "Quadle",                   id: "6780867060", cat: "puzzle",  game: true,  featured: false, desc: "スワイプで数字を合体、2048を目指すパズル。", kw: "2048 merge 数字 マージ" },
  { folder: "leadtheway",      name: "Lead the Way",             id: "6780805979", cat: "puzzle",  game: true,  featured: false, desc: "えんぴつ描き風のやさしい矢印パズル。", kw: "矢印 arrow 道 パズル" },

  // ---- 育成・戦略 ----
  { folder: "mochiusa",        name: "もちうさ うさぎ育成",      id: "6784304463", cat: "sim",     game: true,  featured: true,  desc: "自分だけのうさぎを育てる、癒しの育成ゲーム。", kw: "うさぎ 育成 癒し かわいい raise" },
  { folder: "auto-factory",    name: "オートファクトリー",       id: "6785677430", cat: "sim",     game: true,  featured: false, desc: "採掘から自動化する本格工場づくり（Factorio系）。", kw: "factorio 工場 自動化 生産" },
  { folder: "maou-inc",        name: "魔王株式会社",             id: "6784162519", cat: "sim",     game: true,  featured: false, desc: "瘴気で異世界を侵略する戦略シミュレーション。", kw: "plague inc 魔王 侵略 戦略" },
  { folder: "horihori",        name: "ほりほり魔王",             id: "6784198043", cat: "sim",     game: true,  featured: false, desc: "地面を掘って魔物を育てる育成ディフェンス。", kw: "掘る 魔王 ディフェンス 育成" },
  { folder: "ojisan-farm",     name: "おじさん畑",               id: "6792156972", cat: "sim",     game: true,  featured: false, desc: "おじさんを育てて収穫する、のんびり栽培コレクション。", kw: "なめこ 栽培 収穫 おじさん コレクション" },
  { folder: "deck-hime",       name: "デッキ姫 〜王国カード戦記〜", id: "6787432448", cat: "sim",  game: true,  featured: false, desc: "10枚から最強デッキを育てるデッキ構築カード。", kw: "ドミニオン デッキ構築 カード deckbuilding" },

  // ---- パーティー・推理 ----
  { folder: "wordwolf",        name: "ワードウルフ - 嘘つきは誰だ？", id: "6781790636", cat: "party", game: true, featured: true, desc: "スマホ1台で盛り上がる正体隠しトークゲーム。", kw: "人狼 word wolf 正体隠し パーティー" },
  { folder: "insider",         name: "インサイダーを暴け",       id: "6787274172", cat: "party",   game: true,  featured: false, desc: "答えを操る内通者を探すワード推理ゲーム。", kw: "インサイダー 推理 ワード party" },
  { folder: "bomb-defuse",     name: "サイレント・ボム",         id: "6783998499", cat: "party",   game: true,  featured: false, desc: "声を頼りに時限爆弾を解除する協力ゲーム。", kw: "KTANE 爆弾 協力 解除 co-op" },
  { folder: "hoshizora",       name: "ほしぞら探検隊",           id: "6792155109", cat: "party",   game: true,  featured: false, desc: "声を出さずに夜空を旅する協力トリックテイキング。", kw: "the crew クルー 協力 トリテ カード" },

  // ---- カジュアル・放置 ----
  { folder: "money-clicker",   name: "マネークリッカー",         id: "6783945758", cat: "casual",  game: true,  featured: true,  desc: "タップでお金の帝国を築く放置クリッカー。", kw: "clicker 放置 お金 idle タップ" },
  { folder: "shark-clicker",   name: "Shark Clicker",            id: "6791277136", cat: "casual",  game: true,  featured: false, desc: "タップで育てて海を制覇するサメ進化クリッカー。", kw: "サメ shark clicker 進化 放置" },
  { folder: "god-gacha",       name: "ゴッドガチャ∞",            id: "6787273550", cat: "casual",  game: true,  featured: false, desc: "神々を引き集めるコレクションガチャ。", kw: "ガチャ gacha コレクション 神" },
  { folder: "pill-asmr-ios",   name: "おくすりプチプチ",         id: "6783921551", cat: "casual",  game: false, featured: false, desc: "薬のシートをプチッと押し出す気持ちいいASMR。", kw: "ASMR プチプチ 暇つぶし 薬 pop" },

  // ---- 実用・ツール ----
  { folder: "koyaku-counter",  name: "ShareHistory 収支共有&子役カウント", id: "6790613177", cat: "utility", game: false, featured: false, desc: "パチスロ収支を仲間と共有＆子役カウント。", kw: "パチスロ 収支 子役 カウント 共有" },
  { folder: "blindflow",       name: "BlindFlow",                id: "6786809043", cat: "utility", game: false, featured: false, desc: "アミューズメントポーカー店舗の会員向け公式アプリ。", kw: "会員 ポーカー 店舗 amusement" },
  { folder: "gto-draw",        name: "72＆バドゥーギ GTO道場",   id: "6787277262", cat: "utility", game: false, featured: false, desc: "2-7＆バドゥーギのGTO戦略を学ぶトレーニング。", kw: "GTO ポーカー ドロー badugi 学習" },
  { folder: "ofc-solver",      name: "チャイポEVアシスト",       id: "6783852074", cat: "utility", game: false, featured: false, desc: "チャイポのEVを計算するアシストツール。", kw: "OFC EV solver チャイポ 計算" },
  { folder: "poker-shot-clock",name: "ポーカーショットクロック", id: "6787194138", cat: "utility", game: false, featured: false, desc: "ライブポーカーの持ち時間を管理するタイマー。", kw: "ポーカー タイマー shot clock 時間" },
  { folder: "PokerEquityCalc", name: "Poker Equity Calc",        id: "6781158293", cat: "utility", game: false, featured: false, desc: "NLHの勝率（エクイティ）を計算するツール。", kw: "equity 勝率 poker calc 計算" },
];
