// =====================================================
// app.js — 画面の表示と操作をまとめたメインファイル
//
// 画面の切り替えはURLの「#」以降で行います。
//   #/            ホーム
//   #/zukan       図鑑
//   #/calendar    カレンダー
//   #/shop/ID     お店の詳細（図鑑から開く）
//   #/new         記録する
//   #/edit/ID     記録の編集・削除
//   #/settings    設定（バックアップ・通知・アプリの更新など）
//   #/myposts     自分が共有した記録の一覧
//   #/posts/UID   その人が共有した記録の一覧（?shop=店名 でその店だけ）
//   #/about-chiki ギルチキについて（ガチャ画面から開く）
//   #/points      ポイント履歴（ガチャ画面から開く）
//   #/search      ユーザーを探す（みんなの記録から開く）
//   #/news/v46    お知らせ1件の詳細（お知らせの一覧から開く）
// =====================================================

import * as db from './db.js';
import * as cloud from './cloud.js';

const app = document.getElementById('app');
const $ = (selector) => app.querySelector(selector);

/* ===================== 便利関数 ===================== */

// HTMLに文字を埋め込むときの安全対策（< や > をただの文字として扱う）
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => toDateStr(new Date());

// '2026-09-10' → '2026年9月10日（木）'
function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

// '2026-09-10' → '9/10'
function shortDate(str) {
  const [, m, d] = str.split('-').map(Number);
  return `${m}/${d}`;
}

function newId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── できたことの知らせ（画面上部のバナー） ──────────────────────
// 記録や共有ができたことを、画面の上にしばらく出す。
// 下の小さなお知らせ（toast）は画面が切り替わる間に見逃しやすかったので、
// 大事な「できた」はこちらで知らせる。タップするか、数秒で消える。
// lines: [{ ok: true/false, text }] … チェック付きの行（共有できたかどうかなど）
let doneTimer;
function showDoneBanner({ title, sub = '', lines = [] }) {
  document.getElementById('done-banner')?.remove();
  clearTimeout(doneTimer);
  const el = document.createElement('div');
  el.id = 'done-banner';
  el.className = 'done-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <img class="done-chiki" src="./giruchiki.png" alt="" draggable="false">
    <span class="done-body">
      <span class="done-title">${esc(title)}</span>
      ${sub ? `<span class="done-sub">${esc(sub)}</span>` : ''}
      ${lines.map((l) => `<span class="done-line${l.ok ? '' : ' is-ng'}">${l.ok ? '✓' : '!'} ${esc(l.text)}</span>`).join('')}
    </span>`;
  document.body.appendChild(el);
  navigator.vibrate?.(12);
  const hide = () => {
    clearTimeout(doneTimer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  };
  el.addEventListener('click', hide);
  doneTimer = setTimeout(hide, 4500);
}

// ── 通ってきた道すじ ──────────────────────────────────────────
// 「戻る」は、画面ごとに決めた「ひとつ上」ではなく、実際に通ってきた画面へ戻す。
// 例：ホーム → 自分のプロフィール → フォロー中 → 相手のプロフィール と進んだら、
// 戻るときも逆の順でたどりたい（前は「ひとつ上」の決め打ちだったので、
// 相手のプロフィールからいきなり「みんなの記録」へ飛んでしまっていた）。
// 履歴の項目ひとつひとつに通し番号を付けておき、その番号で道すじを覚えておく。
const trail = [];         // trail[番号] = そのとき見ていた画面（#より後ろ）
const trailTitle = [];    // その画面の見出し。次の画面の「戻る」の表記に使う
let trailAt = -1;         // 今いる履歴の番号
let replacingNow = false; // 今の画面を差し替えている最中かどうか

// 今の画面を道すじに書き込む。戻る向きに動いたときだけ true を返す
function trackVisit(route) {
  const state = history.state ?? {};
  const before = trailAt;
  let at = typeof state.at === 'number' ? state.at : null;
  if (at == null) {
    // 番号が付いていない＝新しく進んできたところ
    at = replacingNow ? Math.max(before, 0) : before + 1;
    trail.length = at;      // 進む先にあった道すじは、もうたどれないので消す
    trailTitle.length = at;
    try {
      history.replaceState({ ...state, at }, '');
    } catch (err) {
      console.warn('履歴に印を付けられませんでした', err);
    }
  }
  replacingNow = false;
  trail[at] = route;
  trailAt = at;
  return at < before;
}

// 実際に通ってきたひとつ前の画面（なければ null）
function trailBack() {
  return trailAt > 0 ? trail[trailAt - 1] ?? null : null;
}

// 戻るボタンに出す「ひとつ前の画面の名前」。戻れないときは null。
// 決まった名前があればそれを、なければその画面の見出し（お店の名前など）を使う
function backLabelOf() {
  const route = trailBack();
  if (!route) return null;
  return screenName(route) ?? trailTitle[trailAt - 1] ?? '戻る';
}

// 画面の名前。見出しを覚えていないとき（ホームや、開き直した直後）に使う
const SCREEN_NAMES = {
  '/zukan': '図鑑',
  '/calendar': 'カレンダー',
  '/new': '記録する',
  '/settings': '設定',
  '/account': 'アカウント',
  '/gacha': 'ガチャ',
  '/badges': 'バッジ',
  '/feed': 'みんなの記録',
  '/recommend': 'おすすめ',
  '/nearby': '近くの店',
  '/news': 'お知らせ',
  '/myposts': '自分の投稿',
  '/about-chiki': 'ギルチキについて',
  '/search': 'ユーザーを探す',
  '/points': 'ポイント履歴',
};

// お店の画面のように、見出しがそのつど変わる画面では undefined を返す（見出しをそのまま使う）
function screenName(route) {
  const [path, queryString = ''] = route.split('?');
  if (path === '/') return 'ホーム';
  if (path.startsWith('/follows/')) {
    return new URLSearchParams(queryString).get('type') === 'followers' ? 'フォロワー' : 'フォロー中';
  }
  if (path.startsWith('/user/')) return 'プロフィール';
  if (path.startsWith('/posts/')) return new URLSearchParams(queryString).get('shop') ? 'お店の記録' : '共有した記録';
  if (path.startsWith('/post/')) return '記録';
  if (path.startsWith('/edit/')) return '記録';
  return SCREEN_NAMES[path];
}

// 戻る。通ってきた画面があれば履歴をひとつ戻し、
// なければ（通知から直接開いたときなど）画面ごとに決めた行き先へ。
function goBack(fallback = '#/') {
  if (trailBack() && history.length > 1) history.back();
  else location.hash = fallback;
}

// 今の画面を別の画面に差し替える（履歴に積まない）。
// 記録が見つからないときなど、その画面を道すじに残したくないときに使う。
function goReplace(hash) {
  if ((location.hash || '#/') === hash) return; // すでにその画面
  replacingNow = true;
  location.replace(hash);
}

// スワイプで戻れるか。戻れるなら行き先を返す
function swipeTarget() {
  if (currentPath() === '/') return null;   // ホームからは戻らない
  return backTarget;                        // 左上のボタンと同じ行き先
}

function currentPath() {
  return (location.hash.slice(1) || '/').split('?')[0];
}

// 右へスワイプするとひとつ上の画面に戻る。
// カレンダーの月送りと同じで、指に合わせて画面が動き、離すとそのまま流れる。
// 横の動きを自分で使う場所（カレンダー・切り抜き・スライダー・図鑑）では何もしない。
// 登録は起動時に1回だけ。
function enableSwipeBack(target) {
  const SLOPE = 1.3;   // 縦より横にはっきり動いていること
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let horizontal = false;
  let busy = false;    // 流れきるまで次の操作を受けない
  let lastX = 0;
  let lastT = 0;
  let speed = 0;

  const width = () => window.innerWidth || 1;

  // 横の動きを自分で使っている場所から始まったかどうか
  function inBusyArea(node) {
    return Boolean(node?.closest?.('.cal-stage, .cropper, input[type="range"]'));
  }

  // 記録の画面では切っておく。点数のスライダーを動かすときに
  // 誤って戻ってしまうのを防ぐため。
  function swipeOff(path) {
    return path === '/new' || path.startsWith('/edit/');
  }

  // カレンダーでは、日付の下にある区切り線より下だけで反応させる。
  // マス目の上は月送りに使うので、はっきり分けておく。
  function belowCalendarLine(y) {
    const line = app.querySelector('.day-panel .section-title');
    if (!line) return true;
    return y > line.getBoundingClientRect().bottom;
  }

  function place(offset, animate) {
    target.style.transition = animate ? 'transform 0.24s cubic-bezier(0.22, 0.9, 0.3, 1)' : 'none';
    target.style.transform = offset ? `translateX(${offset}px)` : '';
  }

  target.addEventListener('touchstart', (event) => {
    const path = currentPath();
    if (busy || event.touches.length !== 1 || !swipeTarget() || swipeOff(path) || inBusyArea(event.target)) {
      tracking = false;
      return;
    }
    const t = event.touches[0];
    if (path === '/calendar' && !belowCalendarLine(t.clientY)) {
      tracking = false;
      return;
    }
    tracking = true;
    horizontal = false;
    startX = lastX = t.clientX;
    startY = t.clientY;
    lastT = event.timeStamp;
    dx = 0;
    speed = 0;
  }, { passive: true });

  target.addEventListener('touchmove', (event) => {
    if (!tracking) return;
    const t = event.touches[0];
    const mx = t.clientX - startX;
    const my = t.clientY - startY;

    if (!horizontal) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (mx <= 0 || Math.abs(mx) < Math.abs(my) * SLOPE) { tracking = false; return; }
      horizontal = true;
      document.body.classList.add('swiping-back');
    }

    dx = mx;
    const dt = event.timeStamp - lastT;
    if (dt > 0) speed = (t.clientX - lastX) / dt;
    lastX = t.clientX;
    lastT = event.timeStamp;
    place(dx, false); // 指と同じだけ動かす
  }, { passive: true });

  function end() {
    if (!tracking) return;
    const wasHorizontal = horizontal;
    tracking = false;
    horizontal = false;
    document.body.classList.remove('swiping-back');
    if (!wasHorizontal) return;

    const S = width();
    const far = dx > S * 0.22;
    // 素早くはじいたときは短くても戻す。ただし、ゆっくり少し動かしただけでは戻さない
    const flicked = speed > 0.5 && dx > 44;

    if (far || flicked) {
      const parent = swipeTarget();
      if (!parent) { place(0, true); return; }
      busy = true;
      const from = location.hash; // 流している間の行き先の確認用
      place(S, true); // 指の動きの続きとして、画面の外まで流す
      setTimeout(() => {
        busy = false;
        // ブラウザや端末自身の「スワイプで戻る」が先に動いていたら、
        // ここで重ねて戻さない（2画面分戻ってしまうのを防ぐ）
        if (location.hash !== from) { place(0, false); return; }
        swipedBack = true;  // 次の描画を「戻る向き」の動きにする
        if (parent === 'history') goBack();
        else location.hash = parent;
      }, 200);
    } else {
      place(0, true); // 足りなければ元に戻す
    }
  }

  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);
}

// ホームだけで使う、下から上へスワイプしてみんなの記録へ行く動き。
// ログインしていない人には見せる場所がないので、何もしない。
// ページを一番下まで送ったあと、さらに上へ引き上げたときだけ反応するので、
// ふだんの縦スクロールとはぶつからない。
function enableHomeSwipeUp(target) {
  const NEED = 150;    // 戻るより長めに引かないと反応しない
  const SLOPE = 1.3;
  let startX = 0;
  let startY = 0;
  let dy = 0;
  let tracking = false;
  let vertical = false;
  let busy = false;

  function atBottom() {
    const doc = document.documentElement;
    const y = window.scrollY || doc.scrollTop || 0;
    return y + window.innerHeight >= doc.scrollHeight - 2;
  }

  function place(offset, animate) {
    target.style.transition = animate ? 'transform 0.24s cubic-bezier(0.22, 0.9, 0.3, 1)' : 'none';
    target.style.transform = offset ? `translateY(${offset}px)` : '';
  }

  target.addEventListener('touchstart', (event) => {
    if (busy || event.touches.length !== 1 || currentPath() !== '/' || !me.user || !atBottom()) {
      tracking = false;
      return;
    }
    const t = event.touches[0];
    tracking = true;
    vertical = false;
    startX = t.clientX;
    startY = t.clientY;
    dy = 0;
  }, { passive: true });

  target.addEventListener('touchmove', (event) => {
    if (!tracking) return;
    const t = event.touches[0];
    const mx = t.clientX - startX;
    const my = t.clientY - startY;

    if (!vertical) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      // 上向き（my がマイナス）で、横よりはっきり縦に動いたときだけ
      if (my >= 0 || Math.abs(my) < Math.abs(mx) * SLOPE) { tracking = false; return; }
      vertical = true;
      document.body.classList.add('swiping-back');
    }

    dy = my; // 上向きなのでマイナス
    event.preventDefault(); // ページ全体が引っぱられて動くのを止める
    place(dy, false);
  }, { passive: false });

  function end() {
    if (!tracking) return;
    const wasVertical = vertical;
    tracking = false;
    vertical = false;
    document.body.classList.remove('swiping-back');
    if (!wasVertical) return;

    if (-dy > NEED) {
      busy = true;
      place(-window.innerHeight, true); // 指の動きの続きとして、画面の上まで流す
      setTimeout(() => {
        busy = false;
        swipedUp = true;
        location.hash = '#/feed';
      }, 200);
    } else {
      place(0, true);
    }
  }

  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);
}

// 記録の並び順：古い順（同じ日なら先に記録したほうが先）
const byOldest = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
const byNewest = (a, b) => byOldest(b, a);

async function loadAll() {
  const [shops, records] = await Promise.all([db.getAll('shops'), db.getAll('records')]);
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  return { shops, records, shopMap };
}

const shopName = (shopMap, id) => shopMap.get(id)?.name ?? '（不明なお店）';

// ブラウザに「このデータは消さないで」とお願いする（初回保存時に1回だけ）
let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

/* ===================== ログイン状態 ===================== */

// 今ログインしている人とそのプロフィール。画面のあちこちで使うので、
// ここで1か所に覚えておいて、変化があったら画面を描き直す。
let me = { user: null, profile: null, ready: false };

cloud.watchAuth(async (user) => {
  me.user = user;
  me.profile = null;
  if (user) {
    try {
      me.profile = await cloud.getProfile(user.uid);
    } catch (err) {
      console.error(err);
    }
  }
  me.ready = true;
  if (user) profileCache.set(user.uid, me.profile);
  // ログイン状態で見た目が変わる画面だけ描き直す
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (path === '/' || path === '/feed' || path === '/myposts' || path === '/search'
    || path.startsWith('/post/') || path.startsWith('/posts/') || path.startsWith('/user/') || path.startsWith('/follows/')) router();
});

const myName = () => me.profile?.nickname ?? me.user?.email?.split('@')[0] ?? '名無し';

/* ---------- 通知（未読のお知らせ） ---------- */

// 「みんなの記録」を最後に見た時刻。この端末にだけ覚えておく。
const SEEN_KEY = 'ramen-log:feed-seen';

function feedSeenAt() {
  return Number(localStorage.getItem(SEEN_KEY) ?? 0);
}

function markFeedSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()));
}

// 通知を切っている相手（自分のプロフィールに覚えている）
const mutedUids = () => me.profile?.mutedUids ?? [];
const isMuted = (uid) => mutedUids().includes(uid);

// フォローしている相手（自分のプロフィールに覚えている）。「みんなの記録」の絞り込みに使う
const followUids = () => me.profile?.follows ?? [];
const isFollowing = (uid) => followUids().includes(uid);

// 前回見てから増えた、他の人の共有の数を数える
async function countUnread() {
  if (!me.user) return 0;
  const since = feedSeenAt();
  if (!since) return 0; // 一度も見ていないうちは知らせない
  try {
    const posts = await cloud.getRecentPosts(30);
    return posts.filter((p) => {
      const at = (p.createdAt?.seconds ?? 0) * 1000;
      return at > since && p.uid !== me.user.uid && !isMuted(p.uid);
    }).length;
  } catch (err) {
    console.error(err);
    return 0;
  }
}

// ホーム右上に出すアイコン（プロフィール画像がなければ頭文字）
function avatarButton() {
  if (!me.user) {
    return '<a class="avatar-btn is-guest" href="#/account" aria-label="ログイン">ロ</a>';
  }
  return `<button type="button" class="avatar-btn" id="avatar-btn" aria-label="アカウントメニュー">
    <img src="${avatarOf(me.profile?.avatar)}" alt=""></button>`;
}

// アイコンを押したときに出る小さなメニュー
function openAvatarMenu(anchor) {
  // すでに開いていたら、もう一度押すと閉じる
  if (document.getElementById('avatar-menu')) {
    document.getElementById('avatar-menu').remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'avatar-menu';
  menu.className = 'avatar-menu';
  menu.innerHTML = `
    <div class="am-head">
      <span class="am-name">${esc(myName())}</span>
      <span class="am-mail">${esc(me.user.email)}</span>
    </div>
    <a class="am-item" href="#/user/${me.user.uid}">プロフィール</a>
    <a class="am-item" href="#/myposts">自分の投稿</a>
    <a class="am-item" href="#/settings">設定</a>
    <button type="button" class="am-item is-quiet" data-am="logout">ログアウト</button>`;
  document.body.appendChild(menu);

  const box = anchor.getBoundingClientRect();
  menu.style.top = `${box.bottom + 8}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;

  function close() {
    menu.remove();
    document.removeEventListener('pointerdown', onOutside, true);
  }
  function onOutside(event) {
    if (!menu.contains(event.target) && event.target !== anchor) close();
  }
  // 開いた直後の同じクリックで閉じないよう、次の間合いから見張る
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

  menu.addEventListener('click', async (event) => {
    if (event.target.dataset.am === 'logout') {
      close();
      if (!confirm('ログアウトしますか？')) return;
      await cloud.signOutUser();
      toast('ログアウトしました');
      return;
    }
    if (event.target.closest('.am-item')) close();
  });
}


/* ===================== 写真 ===================== */

// 表示用URLを使い回すための置き場所
const photoUrls = new Map();

async function getPhotoUrl(photoId) {
  if (!photoId) return null;
  if (photoUrls.has(photoId)) return photoUrls.get(photoId);
  const photo = await db.get('photos', photoId);
  if (!photo) return null;
  const url = URL.createObjectURL(photo.blob);
  photoUrls.set(photoId, url);
  return url;
}

function forgetPhotoUrl(photoId) {
  const url = photoUrls.get(photoId);
  if (url) {
    URL.revokeObjectURL(url);
    photoUrls.delete(photoId);
  }
}

// 写真を縮小してJPEGにする（iPhoneの写真はそのままだと数MBあるため）
async function resizeImage(file, maxSize = 1280, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('画像を変換できませんでした');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした'));
    image.src = url;
  });
}

/* ===================== 切り抜き（トリミング） ===================== */

// 写真の使う範囲を正方形で選んでもらう。
// 「決定」で正方形のJPEGを返し、「やめる」なら null を返す。
const CROP_OUT = 1024; // 書き出す一辺の長さ（ピクセル）

function cropImage(file) {
  return new Promise(async (resolve) => {
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(url);
    } catch {
      URL.revokeObjectURL(url);
      resolve(null);
      return;
    } finally {
      URL.revokeObjectURL(url); // 読み込めたら、もう要らない
    }

    const host = document.createElement('div');
    host.className = 'cropper';
    host.innerHTML = `
      <div class="crop-head">
        <button type="button" class="crop-btn" data-crop="cancel">やめる</button>
        <span class="crop-title">使う範囲を決める</span>
        <button type="button" class="crop-btn is-ok" data-crop="ok">決定</button>
      </div>
      <div class="crop-body">
        <div class="crop-stage"><canvas class="crop-img"></canvas></div>
        <div class="crop-tools">
          <button type="button" class="step" data-crop="out" aria-label="縮小">−</button>
          <input class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="拡大">
          <button type="button" class="step" data-crop="in" aria-label="拡大">＋</button>
        </div>
        <div class="crop-tools crop-rotate">
          <button type="button" class="crop-turn" data-crop="turn" aria-label="左に90度回す">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M7.5 7.5A7 7 0 1 1 5 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
              <path d="M7.8 3.2v4.6H3.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <span class="crop-angle" aria-live="polite">0°</span>
          <button type="button" class="crop-reset" data-crop="level" disabled>傾きを戻す</button>
        </div>
        <p class="crop-hint">1本指で動かす。2本指でつまむと拡大、ひねると回転。<br>左のボタンで90度ずつ回せます。</p>
      </div>`;
    document.body.appendChild(host);

    const stage = host.querySelector('.crop-stage');
    const view = host.querySelector('.crop-img'); // 写真を描いたキャンバス。CSSで動かす・回す
    const zoom = host.querySelector('.crop-zoom');
    const angleEl = host.querySelector('.crop-angle');
    const levelBtn = host.querySelector('[data-crop="level"]');

    const S = stage.clientWidth; // 枠の一辺（画面上の大きさ）
    const F = S / 2;             // 枠の中心（縦横とも）

    // 大きすぎる写真は動かすたびに重くなるので、長辺を MAX_SRC に縮めてから扱う
    // （書き出しは1024pxなので、4倍まで拡大してもこれで足りる）
    const MAX_SRC = 2048;
    const srcScale = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
    const nw = Math.max(1, Math.round(img.naturalWidth * srcScale));
    const nh = Math.max(1, Math.round(img.naturalHeight * srcScale));
    view.width = nw;
    view.height = nh;
    view.style.transformOrigin = '50% 50%'; // 写真の真ん中を軸に回す
    view.getContext('2d').drawImage(img, 0, 0, nw, nh);

    // 倍率1のときに（回していない）写真全体がちょうど収まるようにする
    const base = Math.min(S / nw, S / nh);

    // 写真の状態。角度に制限はなく、指でひねったぶんだけ回る
    let k = 1;      // 拡大の倍率（1〜4）
    let rot = 0;    // 回転（ラジアン、右回りが正）
    let cx = F;     // 写真の中心が枠のどこにあるか
    let cy = F;

    const W = () => nw * base * k; // 画面上の写真の幅・高さ（回す前）
    const H = () => nh * base * k;

    // 角度 rot のとき、枠を写真の向きに合わせて見たときの「半分の幅」
    const frameHalf = (r) => F * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
    // 角度 rot で枠が写真からはみ出さない（四隅に隙間が出ない）最小の倍率
    const coverK = (r) => (2 * frameHalf(r)) / (Math.min(nw, nh) * base);
    // 拡大の上限。ふだんは4倍、細長い写真を大きく傾けたときは埋めるのに必要なぶんまで
    const maxK = (r) => Math.max(4, coverK(r));
    // 今、枠の中が写真で埋まっているか
    const isCovered = () => Math.min(W(), H()) >= 2 * frameHalf(rot) - 0.5;

    // 写真が枠から外れすぎないように位置を直す。
    // 写真の向きにそろえた座標で考えると、縦横それぞれ単純な範囲の問題になる：
    //   写真のほうが大きい向き → 枠の外に隙間ができない範囲で動かせる
    //   写真のほうが小さい向き → 真ん中にそろえる（回していないときの動きと同じ）
    function clampPosition() {
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const ox = cx - F;
      const oy = cy - F;
      let u = ox * cos + oy * sin;   // 写真の向きで見た横のずれ
      let v = -ox * sin + oy * cos;  // 写真の向きで見た縦のずれ
      const E = frameHalf(rot);
      const hw = W() / 2;
      const hh = H() / 2;
      u = hw >= E ? Math.max(-(hw - E), Math.min(hw - E, u)) : 0;
      v = hh >= E ? Math.max(-(hh - E), Math.min(hh - E, v)) : 0;
      cx = F + u * cos - v * sin;
      cy = F + u * sin + v * cos;
    }

    // 角度の表示（-180〜180°）
    function angleDeg() {
      let d = (rot * 180) / Math.PI;
      d = ((d % 360) + 540) % 360 - 180;
      return Math.round(d * 10) / 10;
    }

    function apply() {
      clampPosition();
      view.style.width = `${W()}px`;
      view.style.height = `${H()}px`;
      view.style.transform = `translate(${cx - W() / 2}px, ${cy - H() / 2}px) rotate(${rot}rad)`;
      zoom.value = k;
      const d = angleDeg();
      angleEl.textContent = `${d > 0 ? '+' : ''}${d}°`;
      levelBtn.disabled = Math.abs(d % 90) < 0.05;
    }

    // 点 (px, py) を動かさずに、倍率を ratio 倍・角度を dRot だけ変える
    function transformAround(px, py, ratio, dRot) {
      const cos = Math.cos(dRot);
      const sin = Math.sin(dRot);
      const dx = (cx - px) * ratio;
      const dy = (cy - py) * ratio;
      cx = px + dx * cos - dy * sin;
      cy = py + dx * sin + dy * cos;
    }

    // 枠の真ん中を中心に拡大率だけ変える（スライダー・＋−ボタン）
    function zoomTo(next) {
      const clamped = Math.max(1, Math.min(maxK(rot), next));
      transformAround(F, F, clamped / k, 0);
      k = clamped;
      apply();
    }

    // 角度を変える。枠が写真で埋まっていたなら、回したあとも埋まるよう少し拡大する
    function rotateTo(next, px = F, py = F) {
      const covered = isCovered();
      transformAround(px, py, 1, next - rot);
      rot = next;
      if (covered && k < coverK(rot)) {
        const nk = coverK(rot);
        transformAround(F, F, nk / k, 0);
        k = nk;
      }
      apply();
    }

    apply();

    // --- 指の操作（1本でドラッグ、2本でつまむ・ひねる） ---
    const points = new Map();
    let gesture = null; // 2本指の前回の状態 { dist, angle, mx, my }

    function twoFingerState() {
      const [a, b] = [...points.values()];
      const box = stage.getBoundingClientRect();
      return {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        mx: (a.x + b.x) / 2 - box.left,
        my: (a.y + b.y) / 2 - box.top,
      };
    }

    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture = points.size >= 2 ? twoFingerState() : null;
    });

    stage.addEventListener('pointermove', (e) => {
      if (!points.has(e.pointerId)) return;
      e.preventDefault();
      const prev = points.get(e.pointerId);
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (points.size >= 2) {
        const now = twoFingerState();
        if (!gesture) { gesture = now; return; }
        const covered = isCovered();
        // 指の間の距離の変化 → 拡大、指を結ぶ線の向きの変化 → 回転
        let dRot = now.angle - gesture.angle;
        if (dRot > Math.PI) dRot -= 2 * Math.PI;   // -180°〜180°をまたいだとき
        if (dRot < -Math.PI) dRot += 2 * Math.PI;
        const pinch = gesture.dist > 0 ? now.dist / gesture.dist : 1;
        let nk = Math.max(1, Math.min(maxK(rot + dRot), k * pinch));
        // 枠が埋まった状態で回したときは、隙間が出ないところまで自動で拡大する
        // （自分で縮めているときは、その操作を優先する）
        if (covered && pinch >= 0.999) nk = Math.max(nk, coverK(rot + dRot));
        // 指の真ん中を中心に回して拡大し、指の真ん中が動いたぶんだけ一緒に動かす
        transformAround(gesture.mx, gesture.my, nk / k, dRot);
        cx += now.mx - gesture.mx;
        cy += now.my - gesture.my;
        k = nk;
        rot += dRot;
        gesture = now;
        apply();
      } else {
        cx += e.clientX - prev.x;
        cy += e.clientY - prev.y;
        apply();
      }
    });

    function release(e) {
      points.delete(e.pointerId);
      // 指が1本に減ったら、そこからはドラッグとして続ける
      gesture = points.size >= 2 ? twoFingerState() : null;
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    zoom.addEventListener('input', () => zoomTo(Number(zoom.value)));

    // --- ボタン ---
    function finish(blob) {
      document.body.classList.remove('no-scroll');
      host.remove();
      resolve(blob);
    }

    host.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-crop]')?.dataset.crop;
      if (!action) return;
      if (action === 'in') { zoomTo(k + 0.25); return; }
      if (action === 'out') { zoomTo(k - 0.25); return; }
      if (action === 'turn') { rotateTo(rot - Math.PI / 2); return; }
      if (action === 'level') {
        // いちばん近い「まっすぐ」（0°・90°・180°・270°）に戻す
        rotateTo(Math.round(rot / (Math.PI / 2)) * (Math.PI / 2));
        return;
      }
      if (action === 'cancel') { finish(null); return; }

      // 画面で見えている範囲をそのまま正方形に描き出す
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUT;
      canvas.height = CROP_OUT;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2A251F'; // 余白が出たときの下地
      ctx.fillRect(0, 0, CROP_OUT, CROP_OUT);
      const r = CROP_OUT / S;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(cx * r, cy * r);
      ctx.rotate(rot);
      ctx.drawImage(view, (-W() / 2) * r, (-H() / 2) * r, W() * r, H() * r);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      finish(blob);
    });

    document.body.classList.add('no-scroll');
  });
}

/* ===================== 共通パーツ ===================== */

// 画面上部のバー。back に 'history' を渡すと「ひとつ前の画面へ戻る」ボタンになる
// 左上の「戻る」ボタンが指している行き先。
// スワイプで戻るときも同じ場所を使うので、表記と実際の移動先が必ず一致する。
// 画面を切り替えるたびに router が null に戻し、header が呼ばれたときに入る。
let backTarget = null;

function header(title, { back = '#/', backLabel = 'ホーム' } = {}) {
  trailTitle[trailAt] = title; // 次の画面の「戻る」にこの名前が出る
  const label = backLabelOf(); // 実際に通ってきたひとつ前の画面
  if (label) {
    backTarget = 'history';    // スワイプでも同じところへ戻す
    return `<header class="bar"><button type="button" class="back" data-action="back">‹ ${esc(label)}</button><h1 class="bar-title">${esc(title)}</h1></header>`;
  }
  // 通知やブックマークからこの画面を直接開いたとき用の行き先
  backTarget = back === 'history' ? '#/' : back;
  return `<header class="bar"><a class="back" href="${backTarget}">‹ ${esc(backLabel)}</a><h1 class="bar-title">${esc(title)}</h1></header>`;
}

// 記録の1行（タップすると編集画面へ）
function recordRow(record, main, sub) {
  return `
    <li>
      <a class="rec-row${record.score >= GUILTY ? ' is-guilty' : ''}" href="#/edit/${record.id}">
        <span class="rec-date">${shortDate(record.date)}</span>
        <span class="rec-main">
          <span class="rec-title">${esc(main)}</span>
          <span class="rec-sub">${esc(sub)}</span>
        </span>
        <span class="rec-score">${record.score}<small>点</small></span>
      </a>
    </li>`;
}

const noImage = '<span class="noimage">No Image</span>';

/* ===================== マスコット「ギルチキ」 ===================== */

const GUILTY = 95; // この点数以上が「ギルティ」

// 「まだ行っていない近くの店を探す」で使うAPIキー。
// Google Cloud側で「Places API (New)のみ」「このサイト(ho43.github.io/ramen-app)のみ」に
// 制限してあるので、コードに直接書いても悪用されにくい。
// もしキーを作り直したときは、ここを書き換える。
const PLACES_API_KEY = 'AIzaSyBhWQ4BKaWDGpTDiIsHIFqa0TvKSSVBNyM';

// 課金が発生しないよう、呼び出し回数をアプリ側でも絞っておく（Google側の割り当てとは別の保険）。
// 場所を変えて何度か試せるよう、1回きりではなく少し余裕を持たせている
const NEARBY_DAILY_LIMIT = 3;

// 通知（プッシュ通知）用。Firebaseコンソール →「プロジェクトの設定」→
// 「Cloud Messaging」タブ →「ウェブ構成」の「鍵ペアを生成」で発行される文字列。
// まだ発行していない・貼り替えていない間は、通知を有効にするボタンを出さない
const VAPID_KEY = 'BGvdofOsFN5YEP27w8EaxpPeaCVHn0o53B7DgqBNI_d-w3kw6_-VbQgZrRoJttBxSe-2anlWw8N8jU-V2nArgFU';
const FCM_TOKEN_KEY = 'ramen-log:fcm-token';

// この端末・この開き方で通知が使えそうかどうか
async function notificationsAvailable() {
  return VAPID_KEY !== '__VAPID_KEY__' && await cloud.notificationsSupported();
}

// 通知を許可してもらい、宛先を保存するところまで一気にやる。
// 設定画面・お知らせ画面のどちらからも同じ処理を呼べるよう、ここに1つだけ置いている。
// 戻り値: 'ok'（有効にできた） / 'denied'（許可されなかった） / エラーは投げる
async function enableNotificationsNow() {
  const reg = await navigator.serviceWorker.getRegistration();
  const token = await cloud.enableNotifications(VAPID_KEY, reg);
  if (!token) return 'denied';
  await cloud.saveFcmToken(me.user.uid, token);
  localStorage.setItem(FCM_TOKEN_KEY, token);
  return 'ok';
}
// 点数を4段階に分ける
function faceTier(score) {
  if (score >= GUILTY) return 3; // ギルティ
  if (score >= 70) return 2;     // うまい
  if (score >= 40) return 1;     // ふつう
  return 0;                      // なんす
}

const TIER_WORD = ['なんす', 'ふつう', 'うまい', 'ギルティ！'];

const TIER_TALK = [
  ['なんす。次に期待。', 'こういう日もある。', 'まあ、次だ。'],
  ['悪くない。', 'ふつうにアリ。', '安定してる。'],
  ['いいじゃん。', 'うまかったな。', '当たりだ。'],
  ['ギルティ！！！', '完全にギルティ。', 'これはもう罪。'],
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* ===================== ギルチキの衣装（ガチャ） =====================
   端末の中だけのお楽しみ要素。ポイントも衣装も、この端末にしか残らない
   （Firebaseには送らない）。db.js の 'chiki' に1件だけ保存する。 */

// 位置は giruchiki.png（横向き、頭が左上）の実際の見た目に合わせた目分量。
// .chiki は正方形の枠で、画像は object-fit: contain で収まっている。
const COSTUMES = [
  { id: 'beret', name: 'ベレー帽', rarity: 1, vbW: 54, vbH: 20,
    svg: '<ellipse cx="27" cy="12" rx="20" ry="8" fill="#C0392B"/><circle cx="27" cy="4" r="3" fill="#8A2419"/>',
    left: 12, top: 1 },
  { id: 'ribbon', name: '首もとのリボン', rarity: 1, vbW: 22, vbH: 14,
    svg: '<path d="M0 7 L11 0 L11 14 Z" fill="#F2A007"/><path d="M22 7 L11 0 L11 14 Z" fill="#F2A007"/><circle cx="11" cy="7" r="3.4" fill="#C0392B"/>',
    left: 12, top: 40 },
  { id: 'sunglasses', name: 'サングラス', rarity: 2, vbW: 36, vbH: 14,
    svg: '<rect x="0" y="2" width="16" height="11" rx="5.5" fill="#1C1A17"/><rect x="20" y="2" width="16" height="11" rx="5.5" fill="#1C1A17"/><rect x="16" y="6" width="4" height="3" fill="#1C1A17"/>',
    left: 15, top: 22 },
  { id: 'scarf', name: 'マフラー', rarity: 2, vbW: 46, vbH: 34,
    svg: '<path d="M0 4 Q23 -4 46 4 L46 15 Q23 22 0 15 Z" fill="#8FBF4A"/><rect x="6" y="14" width="8" height="20" rx="2" fill="#8FBF4A"/>',
    left: 8, top: 39 },
  { id: 'crown', name: '金の王冠', rarity: 3, vbW: 36, vbH: 16,
    svg: '<path d="M0 16 L0 4 L9 11 L18 0 L27 11 L36 4 L36 16 Z" fill="#F2A007" stroke="#A96D05" stroke-width="1.5" stroke-linejoin="round"/>',
    left: 15, top: -5 },
  { id: 'halo', name: '天使の輪', rarity: 3, vbW: 36, vbH: 11,
    svg: '<ellipse cx="18" cy="6" rx="16" ry="5" fill="none" stroke="#F2A007" stroke-width="3"/>',
    left: 15, top: -15 },
];

const costumeById = (id) => COSTUMES.find((c) => c.id === id) ?? null;

/* ===================== 名前バッジ（共有した杯数） =====================
   共有した記録の数（他の人にも見えている数）に応じて、段階が上がっていく。
   どれを表示するかは本人が選べる（解放していない段階は選べない）。

   絵がまだ無いものは file を null にしておくと、一覧では「準備中」と出る。
   絵が用意できたら file にファイル名を入れるだけでそのまま使えるようにしてある。 */

const BADGE_STEP = 5;   // 何杯ごとに1段階上がるか

const BADGES = [
  { name: '箸 一',     file: null },
  { name: '箸 二',     file: null },
  { name: '箸 三',     file: null },
  { name: 'れんげ 一', file: './badge-renge1.png' },
  { name: 'れんげ 二', file: './badge-renge2.png' },
  { name: 'れんげ 三', file: './badge-renge3.png' },
  { name: '丼 一',     file: null },
  { name: '丼 二',     file: null },
  { name: '丼 三',     file: null },
];

const BADGE_MAX = BADGES.length;

// 段階（1始まり）からバッジを引く。0や範囲外なら null
const badgeByTier = (tier) => (tier >= 1 && tier <= BADGE_MAX ? BADGES[tier - 1] : null);

// 共有した杯数から、解放されている最高の段階を出す（0なら未解放）
function badgeTierForCount(count) {
  return Math.min(BADGE_MAX, Math.floor(count / BADGE_STEP));
}

// 次の段階まであと何杯か。すべて解放済みなら null
function nextBadgeProgress(count) {
  const tier = badgeTierForCount(count);
  if (tier >= BADGE_MAX) return null;
  return {
    nextTier: tier + 1,
    done: count % BADGE_STEP,   // ゲージにたまっている数
    need: BADGE_STEP,           // 次の段階までに必要な数
  };
}

function badgeImg(tier, extraClass = '') {
  const badge = badgeByTier(tier);
  if (!badge?.file) return '';
  return `<img class="name-badge ${extraClass}" src="${badge.file}" alt="${esc(badge.name)}">`;
}

// 次の段階までのゲージ。右端に次に手に入るバッジを置き、
// 詳細ボタンからバッジ一覧へ行ける
function badgeGauge(count) {
  const p = nextBadgeProgress(count);
  const next = p ? badgeByTier(p.nextTier) : null;
  const nextThumb = next
    ? (next.file
      ? `<img class="gauge-next-img" src="${next.file}" alt="${esc(next.name)}">`
      : '<span class="gauge-next-soon">準備中</span>')
    : '<span class="gauge-next-soon">達成</span>';
  return `
    <div class="gauge-box">
      <div class="gauge-head">
        <span class="gauge-label">${p ? `次のバッジまで ${p.done}/${p.need}` : 'すべて集まりました'}</span>
        <a class="mini-btn" href="#/badges">詳細</a>
      </div>
      <div class="gauge-row">
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${p ? (p.done / p.need) * 100 : 100}%"></div>
        </div>
        <span class="gauge-next" title="${next ? esc(next.name) : ''}">${nextThumb}</span>
      </div>
    </div>`;
}

// バッジを手に入れたときの演出（95点のギルティ！と同じ流れ）
function badgeFlash(tier) {
  const badge = badgeByTier(tier);
  if (!badge) return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'guilty-flash';
    el.innerHTML = `<div style="text-align:center">
      ${badge.file
        ? `<img class="badge-flash-img" src="${badge.file}" alt="">`
        : '<p class="badge-flash-soon">準備中</p>'}
      <p class="badge-word">バッジ獲得</p>
      <p class="guilty-sub">${esc(badge.name)}</p></div>`;
    document.body.appendChild(el);
    navigator.vibrate?.(20);
    setTimeout(() => { el.remove(); resolve(); }, 1900);
  });
}

// 共有したあとに呼ぶ。ちょうど区切りに届いていたら演出を出す
async function maybeCelebrateBadge() {
  if (!me.user) return;
  try {
    const count = (await cloud.getPostsByUser(me.user.uid)).length;
    if (count === 0 || count % BADGE_STEP !== 0) return;
    const tier = badgeTierForCount(count);
    if (tier < 1 || tier > BADGE_MAX) return;
    await badgeFlash(tier);
  } catch (err) {
    console.error(err);
  }
}

let chikiState = { points: 0, lastFed: null, owned: [], equipped: null, redeemedCodes: [], pointLog: [] };
let chikiReady = false;

async function loadChikiState() {
  try {
    const saved = await db.get('chiki', 'me');
    if (saved) chikiState = { points: 0, lastFed: null, owned: [], equipped: null, redeemedCodes: [], pointLog: [], ...saved };
  } catch (err) {
    console.error(err);
  }
  chikiReady = true;
}

function saveChikiState() {
  return db.put('chiki', { id: 'me', ...chikiState });
}

// ── ポイントの履歴 ──────────────────────────────
// もらった・使ったポイントを新しい順に残しておく（#/points で見られる）。
// 端末の中に置くだけなので、増えすぎないよう新しいほうから決まった件数だけ残す。
const POINT_LOG_MAX = 300;

// 履歴の1件を作る。amount はもらったらプラス、使ったらマイナス
function pointEntry(amount, label) {
  return { at: Date.now(), amount, label };
}

// 履歴に足した新しい配列を返す（chikiState の書き換えは呼び出し側でまとめて行う）
function withPointLog(...entries) {
  return [...entries.reverse(), ...(chikiState.pointLog ?? [])].slice(0, POINT_LOG_MAX);
}

function fedToday() {
  return chikiState.lastFed === todayStr();
}

// 餌やりでもらえるポイントの候補と、出やすさ（重み）。
// 重みの合計は100でなくてよく、比率だけが意味を持つ
const FEED_REWARDS = [
  { amount: 1, weight: 50 },
  { amount: 3, weight: 35 },
  { amount: 5, weight: 7 },
  { amount: 10, weight: 3 },
  { amount: 15, weight: 1 },
  { amount: 30, weight: 0.5 },
  { amount: 100, weight: 0.001 },
];

function weightedPick(items) {
  const total = items.reduce((sum, x) => sum + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// 餌をあげる。1日1回だけ、決まった候補の中からランダムなポイントがもらえる
async function feedChiki() {
  if (fedToday()) return null;
  const amount = weightedPick(FEED_REWARDS).amount;
  chikiState = {
    ...chikiState,
    points: chikiState.points + amount,
    lastFed: todayStr(),
    pointLog: withPointLog(pointEntry(amount, 'ギルチキに餌をあげた')),
  };
  await saveChikiState();
  return amount;
}

const GACHA_COST = 100;
const RARITY_WEIGHT = { 1: 75, 2: 22, 3: 3 };

// テストプレイ用の引き換えコード。1人1回だけ使える（chikiState.redeemedCodes に記録する）。
// ガチャを何十回も試せるよう、多めのポイントにしてある
const REDEEM_CODES = {
  GACHA2026: 3000,
};

// コードを使う。amount = もらえたポイント（失敗時は null）、reason = 失敗の理由
async function redeemCode(input) {
  const code = input.trim().toUpperCase();
  if (!code) return { amount: null, reason: 'empty' };
  const amount = REDEEM_CODES[code];
  if (amount == null) return { amount: null, reason: 'invalid' };
  if (chikiState.redeemedCodes.includes(code)) return { amount: null, reason: 'used' };
  chikiState = {
    ...chikiState,
    points: chikiState.points + amount,
    redeemedCodes: [...chikiState.redeemedCodes, code],
    pointLog: withPointLog(pointEntry(amount, '引き換えコードを使った')),
  };
  await saveChikiState();
  return { amount, reason: null };
}

// ガチャを1回引く。持っている衣装が出たら、代わりにポイントを返す
async function drawGacha() {
  if (chikiState.points < GACHA_COST) return null;
  const total = COSTUMES.reduce((sum, c) => sum + RARITY_WEIGHT[c.rarity], 0);
  let r = Math.random() * total;
  let got = COSTUMES[0];
  for (const c of COSTUMES) {
    r -= RARITY_WEIGHT[c.rarity];
    if (r <= 0) { got = c; break; }
  }
  const already = chikiState.owned.includes(got.id);
  const refund = already ? 5 : 0; // ダブりは少しだけポイントが戻る
  const log = [pointEntry(-GACHA_COST, `ガチャを引いた（${got.name}）`)];
  if (refund) log.push(pointEntry(refund, `ダブりのお返し（${got.name}）`));
  chikiState = {
    ...chikiState,
    points: chikiState.points - GACHA_COST + refund,
    pointLog: withPointLog(...log),
    owned: already ? chikiState.owned : [...chikiState.owned, got.id],
    equipped: chikiState.equipped ?? got.id,
  };
  await saveChikiState();
  return { costume: got, duplicate: already };
}

async function equipCostume(id) {
  chikiState = { ...chikiState, equipped: id };
  await saveChikiState();
}

// 衣装のSVGを、頭やからだの位置に重ねる。
// 幅を container の何%にするかと、元の縦横比から、高さも%で計算する
// （.chiki は正方形なので、幅と高さの%の基準は同じ）
function costumeOverlay() {
  const c = costumeById(chikiState.equipped);
  if (!c) return '';
  const widthPct = c.vbW / 1.5; // 見た目にちょうどいい大きさに調整した経験値
  const heightPct = widthPct * (c.vbH / c.vbW);
  return `<svg class="chiki-costume" viewBox="0 0 ${c.vbW} ${c.vbH}"
      style="left:${c.left}%; top:${c.top}%; width:${widthPct}%; height:${heightPct}%;"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${c.svg}</svg>`;
}

// 絵は1枚だけ。点数による違いは、傾き・跳ね・きらきら・光で表す（見た目はCSS側）
function mascot(score) {
  const tier = faceTier(score);
  const sparks = tier >= 2
    ? '<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i>'
    : '';
  return `<span class="chiki chiki-t${tier}"><img src="./giruchiki.png" alt="" draggable="false">${sparks}${costumeOverlay()}</span>`;
}

// 指定日から何日連続で記録があるかを数える
function streakDays(records, endDate) {
  const days = new Set(records.map((r) => r.date));
  const d = new Date(`${endDate}T00:00:00`);
  let n = 0;
  while (days.has(toDateStr(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// 記録した直後だけ、その一杯についてギルチキに話させるための目印
let lastSavedId = null;

// 「記録と同時に共有する」の状態を覚えておき、次に記録するときの初期値にする
let shareByDefault = false;

// メニュー名・店名から系統を推測する。上から順に見て、最初に当てはまったものを使う。
// 当てはまらなければ「その他」。判定は自動のみで、手直しはできない
// （外れることもあるが、多少ずれても「最近この系統が多い」の傾向をつかむには十分なため）
const GENRE_RULES = [
  ['二郎系', ['二郎', 'ジロー', 'ジロ系', 'マシマシ']],
  ['家系', ['家系', 'いえけい']],
  ['まぜそば・油そば', ['まぜそば', '油そば', 'あぶらそば']],
  ['つけ麺', ['つけ麺', 'つけめん']],
  ['担々麺', ['担々麺', '担担麺', 'タンタン']],
  ['豚骨', ['豚骨', 'とんこつ']],
  ['味噌', ['味噌', 'みそ']],
  ['塩', ['塩', 'しお']],
  ['醤油', ['醤油', 'しょうゆ']],
];

function genreOf(record, shop) {
  const text = `${record.menu ?? ''} ${shop?.name ?? ''}`;
  for (const [tag, words] of GENRE_RULES) {
    if (words.some((w) => text.includes(w))) return tag;
  }
  return 'その他';
}

// 最近の記録から「今アツい系統」を見つけて、その中でしばらく食べていない
// 高得点の一杯をひとつ選ぶ。材料が足りなかったり、良い候補がなければ null。
function recommendOne(records, shopMap) {
  if (records.length < 10) return null; // 傾向を見るにはまだ少ない

  const byNewest2 = [...records].sort(byNewest);
  const recent = byNewest2.slice(0, 30);

  // 直近30杯を系統ごとに集計。3杯以上ある系統だけを候補にする
  const stats = new Map(); // tag -> { sum, count }
  for (const r of recent) {
    const tag = genreOf(r, shopMap.get(r.shopId));
    if (tag === 'その他') continue;
    const s = stats.get(tag) ?? { sum: 0, count: 0 };
    s.sum += r.score;
    s.count += 1;
    stats.set(tag, s);
  }
  const ranked = [...stats.entries()]
    .filter(([, s]) => s.count >= 3)
    .map(([tag, s]) => ({ tag, avg: s.sum / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg);
  const hot = ranked[0];
  if (!hot) return null;
  const hotTag = hot.tag;

  // そのアツい系統の中から、お店・メニューの組み合わせごとに最高点と最終来店日をまとめる
  const candidates = new Map(); // "shopId::menu" -> { shopId, menu, score, date }
  for (const r of records) {
    if (genreOf(r, shopMap.get(r.shopId)) !== hotTag) continue;
    const key = `${r.shopId}::${r.menu}`;
    const c = candidates.get(key);
    if (!c || r.score > c.score) candidates.set(key, { shopId: r.shopId, menu: r.menu, score: r.score, date: c?.date ?? r.date });
    const cur = candidates.get(key);
    if (r.date > cur.date) cur.date = r.date;
  }

  // しばらく（2週間以上）食べていないものの中から、一番点数が高かったものを選ぶ
  const today = todayStr();
  const gapDays = (date) => Math.floor((new Date(today) - new Date(date)) / 86400000);
  const pool = [...candidates.values()]
    .filter((c) => gapDays(c.date) >= 14)
    .sort((a, b) => b.score - a.score);
  const best = pool[0];
  if (!best) return null;

  const withShopName = (c) => ({ ...c, shopName: shopMap.get(c.shopId)?.name ?? '（不明なお店）', gapDays: gapDays(c.date) });
  const shopNameText = shopMap.get(best.shopId)?.name ?? '（不明なお店）';
  return {
    tag: hotTag,
    avg: hot.avg,
    recentCount: hot.count,
    shopId: best.shopId,
    shopName: shopNameText,
    menu: best.menu,
    score: best.score,
    gapDays: gapDays(best.date),
    line: `最近${hotTag}が強いな。『${shopNameText}』の${best.menu}、そろそろどう？`,
    // 一覧画面用に、候補全体（本命を除く）も点数順で持たせておく
    alternates: pool.slice(1, 5).map(withShopName),
  };
}

// ギルチキが話す一言を選ぶ。
// 当てはまるセリフをすべて集めてから、その中からランダムに1つ選ぶ。
// 優先順位をつけていないので、同じ一杯でも開くたびに違う一言になる。
function chikiTalk(records, subject, extra = []) {
  if (!subject) return idleTalk(records, extra);

  // まずは点数に応じた3つ
  const pool = [...TIER_TALK[faceTier(subject.score)]];

  // その一杯が通算何杯目・その店で何回目だったかを数える
  const order = [...records].sort(byOldest);
  const idx = order.findIndex((r) => r.id === subject.id);
  const nth = idx + 1;
  const shopNth = order.slice(0, idx + 1).filter((r) => r.shopId === subject.shopId).length;

  if (nth === 10) pool.push('10杯突破。');
  if (nth === 50) pool.push('50杯。数字がもう怖い。');
  if (nth === 100) pool.push('100杯。おめでとう。');

  if (shopNth === 1) pool.push('新規開拓だな。');
  if (shopNth === 3) pool.push('またここか。好きだな。');
  if (shopNth === 5) pool.push('常連だな。');
  if (shopNth === 10) pool.push('10回目。もう家だろ。');

  // 連続記録と時間帯の話は、今日の一杯のときだけ（過去の日付で記録したものには言わない）
  if (subject.date === todayStr()) {
    const streak = streakDays(records, subject.date);
    if (streak === 2) pool.push('2日連続か。');
    if (streak === 3 || streak === 4) pool.push(`${streak}日続けて……ギルティ。`);
    if (streak >= 5) pool.push('もう生活だな。');

    const hour = new Date(subject.createdAt).getHours();
    if (hour >= 5 && hour < 10) pool.push('朝から行ったのか。');
    if (hour >= 22 || hour < 2) pool.push('こんな時間に……ギルティ。');
    if (hour >= 2 && hour < 5) pool.push('もう朝じゃないか。');
  }

  // おすすめの一杯があれば、他の一言と同じ扱いで混ぜる（毎回出るわけではない）
  pool.push(...extra);

  return pick(pool);
}

// 今日まだ記録がないときの一言。過去の一杯の中身には触れず、
// 時間帯・前回からの空き具合・ポイントなどから選ぶ。
// extra（おすすめの一杯）は「そろそろどう？」という提案なので、ここに混ぜる
function idleTalk(records, extra = []) {
  if (!records.length) return '一杯目、待ってる。';

  const pool = [
    '腹へった。',
    '今日はどこ行く？',
    '麺、すすりたい。',
    '次の一杯、決まった？',
    'たまには新しい店もいいぞ。',
    'スープの気分。',
    'カロリーのことは忘れろ。',
    '全部のせ、いっとく？',
  ];

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) pool.push('朝ラーって手もある。');
  if (hour >= 11 && hour < 14) pool.push('昼はラーメンだろ。', 'ランチ、決まった？');
  if (hour >= 17 && hour < 22) pool.push('夜ラー、行くか。', '今日の晩飯は？');
  if (hour >= 22 || hour < 2) pool.push('この時間のラーメンは罪の味。', '今から行く？……ギルティ。');
  if (hour >= 2 && hour < 5) pool.push('寝ろ。');

  // 前回からどれくらい空いたか（どの一杯だったかには触れない）
  const last = records.reduce((a, r) => (r.date > a ? r.date : a), '');
  const gap = Math.floor((new Date(`${todayStr()}T00:00:00`) - new Date(`${last}T00:00:00`)) / 86400000);
  if (gap === 1) pool.push('今日も行く？');
  if (gap >= 3 && gap < 7) pool.push('しばらく食べてないな。', `${gap}日空いてる。そろそろだろ。`);
  if (gap >= 7) pool.push('一週間以上空いてる。禁断症状出てない？', 'まだ生きてるか？');

  const monthCount = records.filter((r) => r.date.startsWith(todayStr().slice(0, 7))).length;
  if (monthCount === 0 && new Date().getDate() >= 3) pool.push('今月まだ0杯。');

  if (!fedToday()) pool.push('腹へった。餌くれ。');
  if (chikiState.points >= GACHA_COST) pool.push('ポイント貯まってる。ガチャ回す？');

  pool.push(...extra);
  return pick(pool);
}

// 95点以上で保存したときの演出
function guiltyFlash(message) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'guilty-flash';
    el.innerHTML = `<div style="text-align:center">${mascot(100)}
      <p class="guilty-word">ギルティ！</p>
      <p class="guilty-sub">${esc(message)}</p></div>`;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); resolve(); }, 1600);
  });
}

/* ===================== ホーム ===================== */

async function renderHome() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { shops, records, shopMap } = await loadAll();
  const thisMonth = todayStr().slice(0, 7);
  const monthCount = records.filter((r) => r.date.startsWith(thisMonth)).length;
  const newest = [...records].sort(byNewest);
  const recent = newest.slice(0, 5);

  // ギルチキが話題にする一杯は「今日食べたもの」だけ。日付が変わったら、もう触れない
  // （前は最近の10杯から選んでいたので、何日も前の一杯の話をしてしまっていた）。
  // 記録した直後だけは、日付が今日でなくても、その一杯について話す。
  const today = todayStr();
  const justSaved = lastSavedId ? records.find((r) => r.id === lastSavedId) : null;
  lastSavedId = null;
  const todays = newest.filter((r) => r.date === today);
  const subject = justSaved ?? (todays.length ? pick(todays) : null);
  const rec = recommendOne(records, shopMap);
  const unread = await newsUnreadCount();
  const talk = subject
    ? chikiTalk(records, subject)
    : idleTalk(records, rec ? [rec.line] : []);
  const showRecLink = Boolean(rec) && talk === rec.line;
  const talkSub = subject
    ? `${shopName(shopMap, subject.shopId)}・${subject.score}点`
    : records.length ? '今日はまだ記録なし' : '記録するボタンから始められる';

  if (!alive()) return;
  app.innerHTML = `
    <section class="home">
      <div class="home-top">
        <div>
          <h1 class="app-title">ま</h1>
          <p class="summary">
            ${records.length
              ? `今月 ${monthCount}杯　通算 ${records.length}杯　${shops.length}店`
              : 'まだ記録がありません。最初の一杯を記録しましょう。'}
          </p>
        </div>
        <div class="home-actions">
          <a class="news-btn" href="#/news" aria-label="お知らせ">
            ${bellIcon()}
            ${unread > 0 ? `<span class="news-dot">${unread > 9 ? '9+' : unread}</span>` : ''}
          </a>
          ${avatarButton()}
        </div>
      </div>

      <button type="button" class="greet" id="greet-btn" aria-label="${fedToday() ? '今日はもう餌をあげました' : '餌をあげる'}">
        ${mascot(subject?.score ?? 50)}
        <span class="greet-body">
          <span class="greet-talk">${esc(talk)}<small>${esc(talkSub)}</small></span>
          <span class="greet-foot">
            <span class="greet-feed${fedToday() ? ' is-done' : ''}" id="greet-feed">
              ${fedToday() ? '今日はもう食べた' : 'タップで餌をあげる'}
            </span>
            <span class="greet-points" id="greet-points">${chikiState.points}<small>pt</small></span>
          </span>
        </span>
      </button>
      ${showRecLink ? `<a class="chiki-reco" href="#/recommend">くわしく見る ›</a>` : ''}

      <nav class="tickets">
        <a class="ticket ticket-main" href="#/new">
          <span class="ticket-label">記録する</span>
          <span class="ticket-sub">食べた一杯を残す</span>
        </a>
        <a class="ticket" href="#/zukan">
          <span class="ticket-label">図鑑</span>
          <span class="ticket-sub">${shops.length}店</span>
        </a>
        <a class="ticket" href="#/calendar">
          <span class="ticket-label">カレンダー</span>
          <span class="ticket-sub">今月 ${monthCount}杯</span>
        </a>
        <a class="ticket ticket-wide" href="#/feed" id="feed-ticket">
          <span class="ticket-label">みんなの記録<span class="badge" id="feed-badge" hidden></span></span>
          <span class="ticket-sub">${me.user ? '共有された一杯を見る' : 'ログインすると使えます'}</span>
        </a>
      </nav>

      <h2 class="section-title">最近の記録</h2>
      ${recent.length
        ? `<ul class="rec-list">${recent.map((r) => recordRow(r, shopName(shopMap, r.shopId), r.menu)).join('')}</ul>`
        : '<p class="empty">記録するとここに表示されます。</p>'}
    </section>`;

  const avatar = $('#avatar-btn');
  if (avatar) avatar.onclick = () => openAvatarMenu(avatar);

  // 餌やり。1日1回だけ、押すとポイントがもらえる
  const greetBtn = $('#greet-btn');
  greetBtn.onclick = async () => {
    if (fedToday()) {
      location.hash = '#/gacha'; // 食べ終わっていたら、そのままガチャへ
      return;
    }
    greetBtn.disabled = true;
    const amount = await feedChiki();
    if (amount == null) { greetBtn.disabled = false; return; }
    tap(greetBtn.querySelector('.chiki')); // 食べた反応
    $('#greet-feed').textContent = '今日はもう食べた';
    $('#greet-feed').classList.add('is-done');
    $('#greet-points').innerHTML = `${chikiState.points}<small>pt</small>`;
    await new Promise((r) => setTimeout(r, 260));
    toast(`ギルチキが餌を食べた。+${amount}pt`);
    greetBtn.disabled = false;
  };

  // 前回見てから増えた共有の数を、あとから静かに出す
  if (me.user) {
    countUnread().then((n) => {
      const badge = $('#feed-badge');
      if (!badge || !n) return;
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
      $('#feed-ticket')?.classList.add('has-new');
    });
  }
}

/* ===================== お知らせ（更新内容） ===================== */

async function renderNews() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const read = await newsReadVersion();
  const unreadCount = await newsUnreadCount();

  // 通知がまだ有効になっていない人にだけ、ここからも有効にできるようにする
  const canOfferNotif = me.user
    && await notificationsAvailable()
    && !localStorage.getItem(FCM_TOKEN_KEY)
    && Notification.permission !== 'denied';

  if (!alive()) return;
  app.innerHTML = header('お知らせ', { back: '#/' }) + `
    <section class="news">
      ${canOfferNotif ? `
        <div class="news-notif">
          <p>通知を有効にすると、身内の新しい共有やギルティ・コメントにすぐ気づけます。</p>
          <button type="button" class="btn btn-primary btn-block" id="news-notif-enable">通知を有効にする</button>
        </div>` : ''}
      ${CHANGELOG.length ? '' : '<p class="empty">まだお知らせはありません。</p>'}
      <ul class="news-list">
        ${CHANGELOG.map((entry, i) => `
          <li>
            <a class="news-item${i < unreadCount ? ' is-unread' : ''}" href="#/news/${esc(shortVersion(entry.version))}">
              <span class="news-ver">${esc(shortVersion(entry.version))}</span>
              <span class="news-lines">
                <span class="news-head">
                  <span class="news-title">${esc(entry.title)}</span>
                  ${i < unreadCount ? '<span class="news-new">NEW</span>' : ''}
                </span>
                <span class="news-meta">${esc(newsDate(entry.date))}・${entry.items.length}件の変更</span>
              </span>
              <span class="news-go" aria-hidden="true">›</span>
            </a>
          </li>`).join('')}
      </ul>
      <p class="hint">今お使いの版：${esc(APP_VERSION.replace('ramen-log-', ''))}</p>
    </section>`;

  const notifBtn = $('#news-notif-enable');
  if (notifBtn) {
    notifBtn.onclick = async () => {
      notifBtn.disabled = true;
      try {
        const result = await enableNotificationsNow();
        if (result === 'denied') {
          toast('許可されませんでした');
          notifBtn.disabled = false;
          return;
        }
        toast('通知を有効にしました');
        notifBtn.closest('.news-notif')?.remove();
      } catch (err) {
        console.error(err);
        toast('通知を設定できませんでした');
        notifBtn.disabled = false;
      }
    };
  }

  // 開いた時点で既読にする。表示そのものは今の未読のまま残して、
  // 何が新しかったのかをこの画面の中では見えるようにしておく
  if (CHANGELOG.length && read !== CHANGELOG[0]?.version) await markNewsRead();
}

// '2026-10-02' → '2026年10月2日（金）'。形が違うときはそのまま出す
function newsDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str ?? '') ? formatDate(str) : String(str ?? '');
}

// お知らせ1件の詳細（#/news/v46）
async function renderNewsDetail({ id }) {
  const entry = CHANGELOG.find((e) => shortVersion(e.version) === id);
  if (!entry) {
    goReplace('#/news');
    return;
  }
  app.innerHTML = header(shortVersion(entry.version), { back: '#/news', backLabel: 'お知らせ' }) + `
    <article class="news-detail">
      <span class="news-ver is-big">${esc(shortVersion(entry.version))}</span>
      <h2 class="news-detail-title">${esc(entry.title)}</h2>
      <p class="news-meta">${esc(newsDate(entry.date))}</p>
      ${entry.lead ? `<p class="news-lead">${esc(entry.lead)}</p>` : ''}
      <ul class="news-points">
        ${entry.items.map((t) => {
          // 「見出し：説明」の形なら、見出しを太字にする
          const [head, ...rest] = String(t).split('：');
          return rest.length
            ? `<li><b>${esc(head)}</b><span>${esc(rest.join('：'))}</span></li>`
            : `<li><span>${esc(t)}</span></li>`;
        }).join('')}
      </ul>
    </article>`;
}

/* ===================== おすすめの一杯 ===================== */

async function renderRecommend() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { records, shopMap } = await loadAll();
  const rec = recommendOne(records, shopMap);

  if (!rec) {
    if (!alive()) return;
    app.innerHTML = header('おすすめの一杯', { back: '#/' })
      + '<p class="empty">今はおすすめできる一杯がありません。記録が増えると出てきます。</p>';
    return;
  }

  if (!alive()) return;
  app.innerHTML = header('おすすめの一杯', { back: '#/' }) + `
    <section class="reco">
      <p class="reco-tag">最近アツい系統：${esc(rec.tag)}<small>（直近30杯の平均 ${rec.avg.toFixed(0)}点・${rec.recentCount}杯）</small></p>

      <a class="reco-main" href="#/shop/${rec.shopId}">
        <span class="reco-shop">${esc(rec.shopName)}</span>
        <span class="reco-menu">${esc(rec.menu)}</span>
        <span class="reco-meta">最高${rec.score}点・${rec.gapDays}日前が最後</span>
      </a>

      ${rec.alternates.length ? `
        <h2 class="section-title">同じ系統の他の候補</h2>
        <ul class="reco-list">
          ${rec.alternates.map((c) => `
            <li class="reco-item">
              <a href="#/shop/${c.shopId}">
                <span class="reco-shop">${esc(c.shopName)}</span>
                <span class="reco-menu">${esc(c.menu)}</span>
                <span class="reco-meta">最高${c.score}点・${c.gapDays}日前が最後</span>
              </a>
            </li>`).join('')}
        </ul>` : ''}

      <p class="hint">系統はメニュー名とお店の名前から自動で判定しています。ずれていることもあります。</p>
    </section>`;
}

/* ===================== ガチャ（衣装） ===================== */

function rarityStars(rarity) {
  return '★'.repeat(rarity) + '☆'.repeat(3 - rarity);
}

function costumeThumb(costume, { locked = false, equipped = false } = {}) {
  const widthPct = costume.vbW / 1.5;
  const heightPct = widthPct * (costume.vbH / costume.vbW);
  return `
    <li class="cos-item${locked ? ' is-locked' : ''}${equipped ? ' is-equipped' : ''}" data-costume="${costume.id}">
      <div class="cos-thumb">
        ${locked
          ? '<span class="cos-question">？</span>'
          : `<svg viewBox="0 0 ${costume.vbW} ${costume.vbH}" style="width:${widthPct}%; height:${heightPct}%;"
               xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${costume.svg}</svg>`}
      </div>
      <span class="cos-name">${locked ? '？？？' : esc(costume.name)}</span>
      <span class="cos-rarity">${rarityStars(costume.rarity)}</span>
      ${equipped ? '<span class="cos-badge">着用中</span>' : ''}
    </li>`;
}

/* ===================== バッジ一覧 ===================== */

async function renderBadges() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  if (!me.user) {
    goReplace('#/settings');
    return;
  }

  app.innerHTML = header('バッジ', { back: '#/account', backLabel: 'アカウント' })
    + '<p class="empty">読み込んでいます…</p>';

  let count = 0;
  try {
    count = (await cloud.getPostsByUser(me.user.uid)).length;
  } catch (err) {
    console.error(err);
    if (!alive()) return;
    app.innerHTML = header('バッジ', { back: '#/account', backLabel: 'アカウント' })
      + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  const eligibleTier = badgeTierForCount(count);
  let choice = Math.min(me.profile?.badgeChoice ?? eligibleTier, eligibleTier);

  if (!alive()) return;
  app.innerHTML = header('バッジ', { back: '#/account', backLabel: 'アカウント' }) + `
    <section class="badges">
      <p class="hint">共有した記録が${BADGE_STEP}杯たまるごとに、次のバッジが手に入る。今は ${count}杯。</p>
      ${badgeGauge(count)}

      <h2 class="section-title">名前に付けるバッジを選ぶ</h2>
      <ul class="badge-grid" id="badge-grid"></ul>
    </section>`;

  function draw() {
    const rows = [`
      <li class="badge-cell${choice === 0 ? ' is-selected' : ''}" data-badge="0">
        <span class="bg-thumb bg-thumb-none">なし</span>
        <span class="bg-name">付けない</span>
      </li>`];
    for (let tier = 1; tier <= BADGE_MAX; tier += 1) {
      const badge = badgeByTier(tier);
      const locked = tier > eligibleTier;
      const soon = !badge.file; // 絵がまだ用意できていないもの
      rows.push(`
        <li class="badge-cell${locked || soon ? ' is-locked' : ''}${choice === tier ? ' is-selected' : ''}"
          data-badge="${tier}" ${locked || soon ? 'data-disabled="1"' : ''}>
          <span class="bg-thumb">${soon ? '<span class="bg-soon">準備中</span>' : badgeImg(tier)}</span>
          <span class="bg-name">${esc(badge.name)}</span>
          <span class="bg-need">${locked ? `${tier * BADGE_STEP}杯` : soon ? '絵を準備中' : '解放済み'}</span>
        </li>`);
    }
    $('#badge-grid').innerHTML = rows.join('');
  }

  // 一覧はこの画面限りの要素なので、そこに直接付ける
  $('#badge-grid').addEventListener('click', async (event) => {
    const cell = event.target.closest('[data-badge]');
    if (!cell || cell.dataset.disabled) return;
    choice = Number(cell.dataset.badge);
    draw();
    try {
      await cloud.saveProfile(me.user.uid, { badgeChoice: choice });
      me.profile = { ...me.profile, badgeChoice: choice };
      profileCache.set(me.user.uid, me.profile);
      toast(choice ? 'バッジを変えました' : 'バッジを外しました');
    } catch (err) {
      console.error(err);
      toast(shareErrorMessage(err));
    }
  });

  draw();
}

async function renderGacha() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  await loadChikiState();

  if (!alive()) return;
  app.innerHTML = header('ギルチキガチャ') + `
    <div class="gacha-head">
      <div class="gacha-mascot">${mascot(80)}</div>
      <p class="gacha-points">${chikiState.points}<small>pt</small></p>
      <a class="points-link" href="#/points">ポイント履歴 ›</a>
      <p class="hint">餌をあげるとポイントがもらえる。ホームのギルチキをタップ。</p>
      <a class="about-link" href="#/about-chiki">ギルチキについて</a>
    </div>

    <button type="button" class="btn btn-primary btn-block" id="gacha-draw" ${chikiState.points < GACHA_COST ? 'disabled' : ''}>
      ガチャを引く（${GACHA_COST}pt）
    </button>

    <h2 class="section-title">持っている衣装</h2>
    <ul class="cos-grid" id="cos-owned"></ul>

    <h2 class="section-title">図鑑</h2>
    <ul class="cos-grid" id="cos-all"></ul>`;

  function draw() {
    const noneItem = `
      <li class="cos-item${!chikiState.equipped ? ' is-equipped' : ''}" data-costume="">
        <div class="cos-thumb cos-thumb-none">なし</div>
        <span class="cos-name">なし</span>
        <span class="cos-rarity">&nbsp;</span>
        ${!chikiState.equipped ? '<span class="cos-badge">着用中</span>' : ''}
      </li>`;
    $('#cos-owned').innerHTML = noneItem + chikiState.owned
      .map((id) => costumeThumb(costumeById(id), { equipped: chikiState.equipped === id }))
      .join('');
    $('#cos-all').innerHTML = COSTUMES
      .map((c) => chikiState.owned.includes(c.id)
        ? costumeThumb(c, { equipped: chikiState.equipped === c.id })
        : costumeThumb(c, { locked: true }))
      .join('');
    app.querySelector('.gacha-points').innerHTML = `${chikiState.points}<small>pt</small>`;
    app.querySelector('.gacha-mascot').innerHTML = mascot(80);
    $('#gacha-draw').disabled = chikiState.points < GACHA_COST;
  }

  // #cos-owned はこの画面限りの要素なので、そこに直接付ければ、
  // 画面を離れたときに古い聞き手が残る心配がない
  $('#cos-owned').addEventListener('click', (event) => {
    const item = event.target.closest('[data-costume]');
    if (!item) return;
    equipCostume(item.dataset.costume || null).then(draw);
  });

  $('#gacha-draw').onclick = async () => {
    const btn = $('#gacha-draw');
    btn.disabled = true;
    const result = await drawGacha();
    if (!result) { draw(); return; }
    await showGachaResult(result);
    draw();
  };

  draw();
}

/* ===================== ポイント履歴（#/points） ===================== */

// 'たった今' '3時間前' のような書き方ではなく、いつのことか分かるよう日時で出す
function pointWhen(at) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function renderPoints() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  await loadChikiState();
  if (!alive()) return;

  const log = chikiState.pointLog ?? [];
  const gained = log.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const spent = log.filter((e) => e.amount < 0).reduce((sum, e) => sum - e.amount, 0);

  // 日付ごとにまとめて出す
  const byDay = new Map();
  for (const e of log) {
    const day = toDateStr(new Date(e.at));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }

  app.innerHTML = header('ポイント履歴', { back: '#/gacha', backLabel: 'ガチャ' }) + `
    <section class="points">
      <div class="points-now">
        <span class="points-now-label">今のポイント</span>
        <span class="gacha-points">${chikiState.points}<small>pt</small></span>
      </div>
      ${log.length ? `
        <dl class="shop-stats">
          <div><dt>もらった</dt><dd>${gained}<small>pt</small></dd></div>
          <div><dt>使った</dt><dd>${spent}<small>pt</small></dd></div>
          <div><dt>件数</dt><dd>${log.length}<small>件</small></dd></div>
        </dl>` : ''}
      ${log.length
        ? [...byDay.entries()].map(([day, entries]) => `
          <h2 class="section-title">${esc(formatDate(day))}</h2>
          <ul class="points-list">
            ${entries.map((e) => `
              <li class="points-row">
                <span class="points-label">${esc(e.label)}<small>${esc(pointWhen(e.at))}</small></span>
                <span class="points-amount${e.amount < 0 ? ' is-minus' : ''}">${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)}<small>pt</small></span>
              </li>`).join('')}
          </ul>`).join('')
        : '<p class="empty">まだ履歴がありません。ギルチキに餌をあげたり、ガチャを引いたりするとここに残ります。</p>'}
      <p class="hint">この版（v46）より前の分は記録されていません。履歴はこの端末の中にだけ残り、新しいほうから${POINT_LOG_MAX}件まで見られます。</p>
    </section>`;
}

// ガチャの結果を大きく見せる演出
function showGachaResult({ costume, duplicate }) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'sheet';
    const widthPct = costume.vbW / 1.2;
    const heightPct = widthPct * (costume.vbH / costume.vbW);
    host.innerHTML = `<div class="sheet-box gacha-result">
      <p class="gr-rarity">${rarityStars(costume.rarity)}</p>
      <div class="gr-thumb">
        <svg viewBox="0 0 ${costume.vbW} ${costume.vbH}" style="width:${widthPct}%; height:${heightPct}%;"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${costume.svg}</svg>
      </div>
      <p class="gr-name">${esc(costume.name)}</p>
      ${duplicate ? '<p class="hint">すでに持っていたので、5pt戻ってきた。</p>' : '<p class="hint">はじめて手に入れた！</p>'}
      <button type="button" class="btn btn-primary btn-block" data-close>閉じる</button>
    </div>`;
    document.body.appendChild(host);
    navigator.vibrate?.(16);
    host.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]') || !event.target.closest('.sheet-box')) {
        host.remove();
        resolve();
      }
    });
  });
}

/* ===================== 図鑑 ===================== */

/* ===================== ギルチキについて（#/about-chiki） =====================
   ガチャ画面の「ギルチキについて」から開く説明ページ。
   文章を直したいときは ABOUT_CHIKI を書き換える。
   ガチャの確率やポイントは、実際の設定（RARITY_WEIGHT など）から計算して出すので、
   設定を変えればここの表示も自動で合う。 */

const ABOUT_CHIKI = {
  intro: 'まぜそばの化身。人類の食事を見守っている。',
  profile: [
    ['名前', 'ギルチキ'],
    ['好きなもの', 'まぜ'],
    ['口ぐせ', '「ギルティ！」'],
  ],
};

async function renderAboutChiki() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  await loadChikiState();
  if (!alive()) return;

  const feedMin = Math.min(...FEED_REWARDS.map((r) => r.amount));
  const feedMax = Math.max(...FEED_REWARDS.map((r) => r.amount));

  // 点数ごとの様子。代表の点数で描いて見せる
  const faces = [
    { score: 20, range: '0〜39点' },
    { score: 55, range: '40〜69点' },
    { score: 80, range: `70〜${GUILTY - 1}点` },
    { score: GUILTY, range: `${GUILTY}点以上` },
  ];

  app.innerHTML = header('ギルチキについて', { back: '#/gacha', backLabel: 'ガチャ' }) + `
    <section class="about-chiki">
      <div class="about-hero">
        <div class="about-hero-img">${mascot(100)}</div>
        <p class="about-intro">${esc(ABOUT_CHIKI.intro)}</p>
      </div>

      <h2 class="section-title">プロフィール</h2>
      <dl class="about-profile">
        ${ABOUT_CHIKI.profile.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
      </dl>

      <h2 class="section-title">点数で変わる様子</h2>
      <p class="hint">記録した一杯の点数によって、ギルチキの様子が変わる。</p>
      <ul class="about-faces">
        ${faces.map((f) => `
          <li class="${f.score >= GUILTY ? 'is-guilty' : ''}">
            <span class="about-face">${mascot(f.score)}</span>
            <span class="about-face-word">${esc(TIER_WORD[faceTier(f.score)])}</span>
            <span class="about-face-range">${esc(f.range)}</span>
          </li>`).join('')}
      </ul>

      <h2 class="section-title">遊び方</h2>
      <ol class="about-steps">
        <li>
          <strong>餌をあげる</strong>
          <span>ホームのギルチキをタップすると餌をあげられる。1日1回、${feedMin}〜${feedMax}ptのどれかがもらえる。</span>
        </li>
        <li>
          <strong>ガチャを引く</strong>
          <span>1回${GACHA_COST}pt。持っている衣装が出たときは、5ptが戻ってくる。</span>
        </li>
        <li>
          <strong>着せ替える</strong>
          <span>ガチャ画面の「持っている衣装」を押すと、ギルチキがその衣装に着替える。</span>
        </li>
      </ol>

      <p class="hint">ポイントと衣装はこの端末の中にだけ保存される。機種変更やアプリの削除で消えるので注意。</p>

      <a class="btn btn-primary btn-block about-back" href="#/gacha">ガチャへ戻る</a>
    </section>`;
}

async function renderZukan() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { shops, records } = await loadAll();
  // 登録した順に No.001, No.002 … と番号を振る
  const ordered = [...shops].sort((a, b) => a.createdAt - b.createdAt);

  const items = await Promise.all(ordered.map(async (shop, i) => {
    const recs = records.filter((r) => r.shopId === shop.id).sort(byOldest);
    const first = recs[0]; // 図鑑には「初めて食べた時」の写真とコメントを使う
    return {
      shop,
      no: i + 1,
      count: recs.length,
      comment: first?.comment?.trim() ?? '',
      url: first ? await getPhotoUrl(first.photoId) : null,
    };
  }));

  if (!alive()) return;
  app.innerHTML = header('図鑑') + `
    <a class="btn btn-ghost btn-block" href="#/nearby">まだ行っていない近くの店を探す</a>
  ` + (items.length
    ? `<ul class="zukan">${items.map(zukanCard).join('')}</ul>`
    : '<p class="empty">まだお店がありません。<br><a href="#/new">最初の一杯を記録する</a></p>');
}

function zukanCard({ shop, no, count, comment, url }) {
  return `
    <li>
      <a class="zk-card" href="#/shop/${shop.id}">
        <div class="zk-photo">
          ${url ? `<img src="${url}" alt="" loading="lazy">` : noImage}
          <span class="zk-stamp" aria-label="${count}回">${count}<small>回</small></span>
        </div>
        <div class="zk-body">
          <span class="zk-no">No.${String(no).padStart(3, '0')}</span>
          <h3 class="zk-name">${esc(shop.name)}</h3>
          <p class="zk-comment${comment ? '' : ' is-empty'}">${comment ? esc(comment) : 'コメントがありません'}</p>
        </div>
      </a>
    </li>`;
}

/* ===================== まだ行っていない近くの店 ===================== */

// アプリ側の回数制限。'chiki' はキー値ストアとして使い回している
async function nearbyUsageToday() {
  const rec = await db.get('chiki', 'nearbySearchUsage');
  const today = todayStr();
  return rec?.date === today ? rec.count : 0;
}

async function bumpNearbyUsage() {
  const today = todayStr();
  const used = await nearbyUsageToday();
  await db.put('chiki', { id: 'nearbySearchUsage', date: today, count: used + 1 });
}

// 現在地を取得する。Promiseでラップして待ちやすくしているだけ
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('この端末は位置情報に対応していません')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => reject(new Error('位置情報を取得できませんでした。設定で許可されているか確認してください')),
      { timeout: 10000 },
    );
  });
}

// 名前がすでに図鑑にあるお店と近そうなら、大まかに「行ったことがある」とみなす。
// 完全一致ではないので多少の誤判定はあるが、目安としては十分。
// カタカナ／ひらがなの違いは吸収するが、「ブタ」と「豚」のように表記そのものが
// 違う場合は、文字の重なり具合（何文字が共通しているか）で緩く判定する
function normalizeForMatch(s) {
  return s.replace(/\s/g, '')
    // カタカナをひらがなに寄せる（「ブタ」と「ぶた」を同じ扱いにするため）
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function charOverlapRatio(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const common = [...setA].filter((c) => setB.has(c));
  const minSize = Math.min(setA.size, setB.size);
  return minSize ? common.length / minSize : 0;
}

function looksKnown(placeName, shopNames) {
  const n = normalizeForMatch(placeName);
  return shopNames.some((s) => {
    const t = normalizeForMatch(s);
    if (n.includes(t) || t.includes(n)) return true; // 表記がそのまま含まれていれば確実
    // 短すぎる名前同士の偶然の一致を避けるため、2文字未満は対象外
    return Math.min(n.length, t.length) >= 2 && charOverlapRatio(n, t) >= 0.7;
  });
}

// Text Search (New) を呼ぶ。field maskは基本項目だけに絞って、
// 単価の高い区分（評価・写真など）に引き上がらないようにしている
async function searchNearbyRamen(coords) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({
      textQuery: 'ラーメン',
      languageCode: 'ja',
      maxResultCount: 10,
      locationBias: {
        circle: { center: { latitude: coords.latitude, longitude: coords.longitude }, radius: 3000 },
      },
    }),
  });
  if (!res.ok) throw new Error(`検索に失敗しました（${res.status}）`);
  const data = await res.json();
  return data.places ?? [];
}

// 「済」の判子を押したときにギルチキが言う一言。毎回ランダムに選ぶ
const KNOWN_STAMP_TALK = [
  'ギルチキ）ここはもう行ったことあるみたいだぜ。',
  'ギルチキ）なんだ？また行きてぇのか？',
  'ギルチキ）新しく開拓してみてもいいんじゃないか。',
];

async function renderNearby() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { shops } = await loadAll();
  const shopNames = shops.map((s) => s.name);
  const used = await nearbyUsageToday();
  const remaining = NEARBY_DAILY_LIMIT - used;

  if (!alive()) return;
  app.innerHTML = header('まだ行っていない近くの店') + `
    <section class="nearby">
      <p class="hint">現在地の近くから、ラーメン屋を探します。図鑑にあるお店は目印を付けて区別します。</p>
      <p class="hint" id="nearby-remaining">今日はあと${Math.max(remaining, 0)}回探せます。</p>
      <button type="button" class="btn btn-primary btn-block" id="nearby-search"${remaining <= 0 ? ' disabled' : ''}>
        ${remaining <= 0 ? '今日はもう使いました' : '近くを探す'}
      </button>
      <div id="nearby-result"></div>
    </section>`;

  const btn = $('#nearby-search');
  const result = $('#nearby-result');

  // ハンコはマップへのリンクの上に重なっているので、
  // 押されたときはリンクの方に伝わらないように止めてから説明を出す
  result.addEventListener('click', (event) => {
    const stamp = event.target.closest('[data-knownstamp]');
    if (!stamp) return;
    event.preventDefault();
    event.stopPropagation();
    tap(stamp);
    toast(pick(KNOWN_STAMP_TALK));
  });

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '探しています…';
    result.innerHTML = '';
    try {
      const coords = await currentPosition();
      const places = await searchNearbyRamen(coords);
      await bumpNearbyUsage();

      if (!places.length) {
        result.innerHTML = '<p class="empty">近くでは見つかりませんでした。</p>';
      } else {
        result.innerHTML = `<ul class="nearby-list">${places.map((p) => {
          const name = p.displayName?.text ?? '（名前不明）';
          const address = p.formattedAddress ?? '';
          const known = looksKnown(name, shopNames);
          const mapHref = `https://www.google.com/maps/place/?q=place_id:${p.id}`;
          return `
            <li class="nearby-item${known ? ' is-known' : ''}">
              <a href="${mapHref}" target="_blank" rel="noopener">
                <span class="nearby-name">${esc(name)}</span>
                <span class="nearby-address">${esc(address)}</span>
              </a>
              ${known ? '<button type="button" class="nearby-stamp" data-knownstamp aria-label="このお店について、ギルチキがひとこと">済</button>' : ''}
            </li>`;
        }).join('')}</ul>`;
      }

      // 今日の残り回数の表示を更新
      const left = NEARBY_DAILY_LIMIT - await nearbyUsageToday();
      $('#nearby-remaining').textContent = `今日はあと${Math.max(left, 0)}回探せます。`;
      if (left <= 0) {
        btn.disabled = true;
        btn.textContent = '今日はもう使いました';
      } else {
        btn.disabled = false;
        btn.textContent = '近くを探す';
      }
    } catch (err) {
      console.error(err);
      result.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
      btn.disabled = false;
      btn.textContent = '近くを探す';
    }
  };
}


/* ===================== お店の詳細 ===================== */

// 住所から地図を開くためのURL。店名も一緒に渡すと、
// ただの住所ではなくお店そのものに印が立ちやすい。
function mapUrl(name, address) {
  const q = encodeURIComponent(`${name} ${address}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

async function renderShop({ id }) {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { records, shopMap } = await loadAll();
  const shop = shopMap.get(id);
  if (!shop) { goReplace('#/zukan'); return; }

  const recs = records.filter((r) => r.shopId === id).sort(byOldest);
  const scores = recs.map((r) => r.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const first = recs[0];
  const url = first ? await getPhotoUrl(first.photoId) : null;
  const comment = first?.comment?.trim();

  // 新しい順に並べ、「何回目か」も表示する
  const rows = recs
    .map((r, i) => recordRow(r, r.menu, `${i + 1}回目`))
    .reverse()
    .join('');

  if (!alive()) return;
  app.innerHTML = header(shop.name, { back: '#/zukan', backLabel: '図鑑' }) + `
    <section class="shop">
      <div class="shop-photo">${url ? `<img src="${url}" alt="">` : noImage}</div>
      <p class="shop-comment${comment ? '' : ' is-empty'}">${comment ? esc(comment) : 'コメントがありません'}</p>

      <dl class="shop-stats">
        <div><dt>来店</dt><dd>${recs.length}<small>回</small></dd></div>
        <div><dt>平均</dt><dd>${avg ?? '–'}<small>点</small></dd></div>
        <div><dt>最高</dt><dd>${best ?? '–'}<small>点</small></dd></div>
      </dl>

      ${shop.address
        ? `<p class="shop-address">${esc(shop.address)}
             <a class="map-link" href="${mapUrl(shop.name, shop.address)}" target="_blank" rel="noopener">地図で開く</a>
           </p>`
        : '<p class="shop-address is-empty">住所は未登録です</p>'}

      <a class="btn btn-primary btn-block" href="#/new?shop=${id}">このお店で記録する</a>

      <h2 class="section-title">食べた記録</h2>
      ${rows ? `<ul class="rec-list">${rows}</ul>` : '<p class="empty">記録がありません。</p>'}

      <div class="shop-actions">
        <button type="button" class="btn btn-ghost" id="rename-shop">店名を変更</button>
        <button type="button" class="btn btn-ghost" id="address-shop">住所を${shop.address ? '変更' : '登録'}</button>
      </div>
      <button type="button" class="btn btn-danger btn-block" id="delete-shop">お店を削除</button>
    </section>`;

  $('#address-shop').onclick = async () => {
    const address = prompt('お店の住所を入力してください（空にすると削除します）', shop.address ?? '')?.trim();
    if (address === undefined) return; // キャンセル
    await db.put('shops', { ...shop, address });
    toast(address ? '住所を保存しました' : '住所を削除しました');
    renderShop({ id });
  };

  $('#rename-shop').onclick = async () => {
    const name = prompt('新しい店名を入力してください', shop.name)?.trim();
    if (!name || name === shop.name) return;
    if ([...shopMap.values()].some((s) => s.id !== id && s.name === name)) {
      alert(`「${name}」はすでに登録されています。`);
      return;
    }
    await db.put('shops', { ...shop, name });
    toast('店名を変更しました');
    renderShop({ id });
  };

  $('#delete-shop').onclick = async () => {
    if (!confirm(`「${shop.name}」と、このお店の記録${recs.length}件をすべて削除します。元には戻せません。`)) return;
    const photoIds = recs.map((r) => r.photoId).filter(Boolean);
    await db.deleteShop(id, recs.map((r) => r.id), photoIds);
    photoIds.forEach(forgetPhotoUrl);
    toast('お店を削除しました');
    goReplace('#/zukan');
  };
}

/* ===================== カレンダー ===================== */

let cal = null; // 表示中の年・月と、選んでいる日

// 前月・当月・翌月の3枚を横に並べておき、指の動きに合わせて帯ごと動かす。
// こうすると、少し動かしただけで隣の月が見えて、操作した手応えが返る。
function setupSwipe(stage, track, onCommit) {
  const panes = [...track.children];
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;   // 指を置いている最中か
  let horizontal = false; // 横スワイプだと確定したか
  let swiped = false;     // スワイプ直後の誤タップを防ぐ目印
  let busy = false;       // 切り替えの動きが終わるまで次を受けない
  let lastX = 0;
  let lastT = 0;
  let speed = 0;          // 指を離した瞬間の速さ（px/ミリ秒）

  const width = () => stage.clientWidth || 1;

  // 帯の位置。基準は中央（当月）で、そこから指の分だけずらす
  function place(offset, animate) {
    track.style.transition = animate ? 'transform 0.26s cubic-bezier(0.22, 0.9, 0.3, 1)' : 'none';
    track.style.transform = `translateX(calc(-33.3333% + ${offset}px))`;
  }

  stage.addEventListener('pointerdown', (event) => {
    if (busy) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = event.clientY;
    lastT = event.timeStamp;
    dx = 0;
    speed = 0;
    tracking = true;
    horizontal = false;
    swiped = false;
  });

  stage.addEventListener('pointermove', (event) => {
    if (!tracking || event.pointerId !== pointerId) return;
    const mx = event.clientX - startX;
    const my = event.clientY - startY;

    // 横か縦かは数ピクセルで見分ける。小さくすると反応が早くなる
    if (!horizontal) {
      if (Math.abs(mx) < 5 && Math.abs(my) < 5) return;
      if (Math.abs(my) > Math.abs(mx)) { tracking = false; return; }
      horizontal = true;
      swiped = true;
      stage.setPointerCapture?.(pointerId);
    }

    // 指と同じだけ動かす（控えめにしないほうが素直な手応えになる）
    dx = mx;
    const dt = event.timeStamp - lastT;
    if (dt > 0) speed = (event.clientX - lastX) / dt;
    lastX = event.clientX;
    lastT = event.timeStamp;
    place(dx, false);
  });

  function finish(event) {
    if (event && pointerId !== null && event.pointerId !== pointerId) return;
    const wasHorizontal = horizontal;
    tracking = false;
    horizontal = false;
    pointerId = null;
    if (!wasHorizontal) return;

    const S = width();
    const dir = dx < 0 ? 1 : -1;
    // ゆっくり動かしたときは距離で、素早くはじいたときは速さで判断する。
    // はじいた向きと指の向きが揃っているときだけ、速さでの切り替えを認める。
    const far = Math.abs(dx) > S * 0.18;
    const flicked = Math.abs(speed) > 0.3 && Math.abs(dx) > 12 && Math.sign(speed) === Math.sign(dx);

    if (far || flicked) {
      busy = true;
      place(-dir * S, true);           // 指の動きの続きとして最後まで滑らせる
      // 行数が違う月に移るとき、枠の高さも一緒に変える
      const incoming = panes[dir > 0 ? 2 : 0];
      if (incoming) {
        stage.style.transition = 'height 0.26s cubic-bezier(0.22, 0.9, 0.3, 1)';
        stage.style.height = `${incoming.offsetHeight}px`;
      }
      // 動きの完了と保険のタイマーの両方から呼ばれるので、1回だけ通す
      let fired = false;
      const done = () => {
        if (fired) return;
        fired = true;
        track.removeEventListener('transitionend', done);
        busy = false;
        onCommit(dir);
      };
      track.addEventListener('transitionend', done);
      setTimeout(done, 400);           // 動きが起きなかったときの保険
    } else {
      place(0, true);                  // 戻す
    }
  }

  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
  stage.addEventListener('click', (event) => {
    if (swiped) { event.stopPropagation(); event.preventDefault(); swiped = false; }
  }, true);

  place(0, false);
}

// 1か月分のマス目を組み立てる
function monthCells(y, m, byDate, labelOf, today, selected) {
  const prefix = `${y}-${pad2(m + 1)}`;
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDow; i++) {
    cells += '<div class="cal-cell is-blank" aria-hidden="true"></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${prefix}-${pad2(d)}`;
    const list = byDate.get(date) ?? [];
    const classes = ['cal-cell', `dow-${(firstDow + d - 1) % 7}`];
    if (list.length) classes.push('has-record');
    if (date === today) classes.push('is-today');
    if (date === selected) classes.push('is-selected');
    cells += `
      <button type="button" class="${classes.join(' ')}" data-date="${date}"
        aria-label="${m + 1}月${d}日 ${list.length}杯" aria-pressed="${date === selected}">
        <span class="cal-day">${d}</span>
        ${list.slice(0, 2).map((r) => `<span class="cal-item">${esc(labelOf(r))}</span>`).join('')}
        ${list.length > 2 ? `<span class="cal-more">+${list.length - 2}</span>` : ''}
      </button>`;
  }
  return `<div class="cal-grid">${cells}</div>`;
}

async function renderCalendar() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const today = todayStr();
  if (!cal) {
    const t = new Date();
    cal = { y: t.getFullYear(), m: t.getMonth(), selected: today };
  }

  const { records, shopMap } = await loadAll();
  const byDate = new Map();
  for (const r of [...records].sort(byOldest)) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  const { y, m } = cal;
  const prefix = `${y}-${pad2(m + 1)}`;
  const monthCount = records.filter((r) => r.date.startsWith(prefix)).length;
  const isThisMonth = prefix === today.slice(0, 7);
  const dayList = byDate.get(cal.selected) ?? [];

  // 前月・当月・翌月を並べて置く
  const panes = [-1, 0, 1].map((offset) => {
    const d = new Date(y, m + offset, 1);
    return `<div class="cal-pane">${monthCells(d.getFullYear(), d.getMonth(), byDate, (r) => shopName(shopMap, r.shopId), today, cal.selected)}</div>`;
  }).join('');

  if (!alive()) return;
  app.innerHTML = header('カレンダー') + `
    <div class="cal-nav">
      <button type="button" class="cal-arrow" data-move="-1" aria-label="前の月">‹</button>
      <h2 class="cal-month">${y}年${m + 1}月<small>${monthCount}杯</small></h2>
      <button type="button" class="cal-arrow" data-move="1" aria-label="次の月">›</button>
    </div>
    ${isThisMonth ? '' : '<button type="button" class="cal-back-today" data-move="today">今月に戻る</button>'}
    <div class="cal-week" aria-hidden="true">
      ${[...'日月火水木金土'].map((w, i) => `<span class="dow-${i}">${w}</span>`).join('')}
    </div>
    <div class="cal-stage" id="cal-stage">
      <div class="cal-track" id="cal-track">${panes}</div>
    </div>

    <section class="day-panel">
      <h2 class="section-title">${formatDate(cal.selected)}</h2>
      ${dayList.length
        ? `<ul class="rec-list">${dayList.map((r) => recordRow(r, shopName(shopMap, r.shopId), r.menu)).join('')}</ul>`
        : '<p class="empty">この日の記録はありません。</p>'}
      <a class="btn btn-ghost btn-block" href="#/new?date=${cal.selected}">この日の記録を追加</a>
    </section>`;

  const track = $('#cal-track');

  // 月を移動する（delta = -1で前の月、+1で次の月、'today'で今月）
  function moveMonth(delta) {
    const target = delta === 'today' ? new Date() : new Date(cal.y, cal.m + Number(delta), 1);
    cal.y = target.getFullYear();
    cal.m = target.getMonth();
    const targetPrefix = `${cal.y}-${pad2(cal.m + 1)}`;
    cal.selected = targetPrefix === today.slice(0, 7) ? today : `${targetPrefix}-01`;
    renderCalendar();
  }

  // 矢印ボタンも、スワイプと同じ滑り方で切り替える
  function slideTo(delta) {
    if (delta === 'today') { moveMonth(delta); return; }
    const dir = Number(delta);
    const stageEl = $('#cal-stage');
    track.style.transition = 'transform 0.26s cubic-bezier(0.22, 0.9, 0.3, 1)';
    track.style.transform = `translateX(calc(-33.3333% + ${-dir * (stageEl.clientWidth || 0)}px))`;
    const incoming = track.children[dir > 0 ? 2 : 0];
    if (incoming) {
      stageEl.style.transition = 'height 0.26s cubic-bezier(0.22, 0.9, 0.3, 1)';
      stageEl.style.height = `${incoming.offsetHeight}px`;
    }
    setTimeout(() => moveMonth(dir), 240);
  }

  app.querySelectorAll('[data-move]').forEach((btn) => {
    btn.onclick = () => slideTo(btn.dataset.move);
  });

  app.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
    cell.onclick = () => {
      cal.selected = cell.dataset.date;
      renderCalendar();
    };
  });

  // 枠の高さは表示中の月に合わせる（月ごとに行数が違うため）
  const stage = $('#cal-stage');
  stage.style.transition = 'none';
  stage.style.height = `${track.children[1].offsetHeight}px`;

  setupSwipe(stage, track, moveMonth);
}

/* ===================== 記録する・編集する ===================== */

async function renderNew({ query }) {
  await renderForm({ presetShopId: query.get('shop'), presetDate: query.get('date') });
}

async function renderEdit({ id }) {
  const record = await db.get('records', id);
  if (!record) { goReplace('#/'); return; }
  await renderForm({ record });
}

// 新しい記録の書きかけを覚えておく置き場所。
// 別の画面に移っても、戻ってきたら続きから書けるようにするため。
// 記録し終えたら空にする。
let draft = null;

function clearDraft() {
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  draft = null;
}

async function renderForm({ record = null, presetShopId = null, presetDate = null }) {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const isEdit = Boolean(record);
  const { shops, records } = await loadAll();
  // 書きかけがあれば、そこから復元する（新規記録のときだけ）
  const saved0 = isEdit ? null : draft;

  // お店ごとの記録回数と、最後に行った日
  const counts = new Map();
  const lastVisit = new Map();
  for (const r of records) {
    counts.set(r.shopId, (counts.get(r.shopId) ?? 0) + 1);
    if (!lastVisit.has(r.shopId) || r.date > lastVisit.get(r.shopId)) lastVisit.set(r.shopId, r.date);
  }
  // 最近行ったお店ほど上に並べる
  const sortedShops = [...shops].sort((a, b) =>
    (lastVisit.get(b.id) ?? '').localeCompare(lastVisit.get(a.id) ?? '') || a.name.localeCompare(b.name, 'ja'));

  let selectedShop = '';
  if (record) selectedShop = record.shopId;
  else if (saved0 && (saved0.shopId === '__new' || shops.some((s) => s.id === saved0.shopId))) selectedShop = saved0.shopId;
  else if (shops.some((s) => s.id === presetShopId)) selectedShop = presetShopId;
  else if (!shops.length) selectedShop = '__new';

  const score = record?.score ?? saved0?.score ?? 50;
  const date = record?.date
    ?? saved0?.date
    ?? (/^\d{4}-\d{2}-\d{2}$/.test(presetDate ?? '') ? presetDate : todayStr());
  const currentPhotoUrl = record ? await getPhotoUrl(record.photoId) : (saved0?.previewUrl ?? null);

  // 一緒に食べた人。ログインしているときだけ選べる
  const allMembers = me.user ? await loadMembers() : [];
  // 今この記録に付いている人。もう抜けた人が残らないよう、一覧にいる人だけに絞る
  const withUids = new Set(
    (record?.withUids ?? saved0?.withUids ?? []).filter((uid) => allMembers.some((m) => m.uid === uid)),
  );
  // 選べるのはフォローしている人だけ。
  // ただし、前に付けた人をあとでフォロー解除していても、編集で外れてしまわないよう残しておく
  const members = allMembers.filter((m) => isFollowing(m.uid) || withUids.has(m.uid));

  if (!alive()) return;
  app.innerHTML = header(isEdit ? '記録を編集' : '記録する', { back: 'history' }) + `
    <form class="form" id="rec-form" novalidate>
      <div class="field">
        <label for="f-shop">お店</label>
        <select id="f-shop">
          <option value="" disabled ${selectedShop === '' ? 'selected' : ''}>お店を選ぶ</option>
          ${sortedShops.map((s) => `
            <option value="${s.id}" ${s.id === selectedShop ? 'selected' : ''}>${esc(s.name)}（${counts.get(s.id) ?? 0}回）</option>`).join('')}
          <option value="__new" ${selectedShop === '__new' ? 'selected' : ''}>＋ 初めてのお店</option>
        </select>
        <input id="f-newshop" type="text" placeholder="店名を入力" maxlength="50" autocomplete="off" hidden value="${esc(saved0?.newShop)}">
        <input id="f-newaddress" type="text" placeholder="住所（任意。入れると地図で開けます）" maxlength="120" autocomplete="off" hidden value="${esc(saved0?.newAddress)}">
        <p class="hint" id="f-count"></p>
      </div>

      <div class="field" id="f-address-field" hidden>
        <label for="f-address">住所<small>（任意。入れると地図で開けます）</small></label>
        <input id="f-address" type="text" placeholder="住所を入力" maxlength="120" autocomplete="off">
      </div>

      <div class="field">
        <label for="f-menu">食べたもの</label>
        <input id="f-menu" type="text" placeholder="例：特製醤油ラーメン" maxlength="60" autocomplete="off" value="${esc(record?.menu ?? saved0?.menu)}">
      </div>

      <div class="field">
        <label for="f-date">日付</label>
        <input id="f-date" type="date" value="${date}">
      </div>

      <div class="field">
        <label for="f-score">評価</label>
        <div class="score-box${score >= GUILTY ? ' is-guilty' : ''}" id="f-score-box">
          <div class="score-head">
            <span id="f-mascot">${mascot(score)}</span>
            <span class="score-read"><output id="f-score-out" for="f-score">${score}</output><span class="score-unit">点</span></span>
            <span class="score-word" id="f-score-word">${TIER_WORD[faceTier(score)]}</span>
          </div>
          <div class="score">
            <button type="button" class="step" data-step="-1" aria-label="1点下げる">−</button>
            <input id="f-score" type="range" min="0" max="100" step="1" value="${score}">
            <button type="button" class="step" data-step="1" aria-label="1点上げる">＋</button>
          </div>
        </div>
      </div>

      <div class="field">
        <span class="label">写真<small>（なくても記録できます）</small></span>
        <div class="photo-pick">
          <img id="f-preview" alt="選んだ写真" hidden>
          <span id="f-noimage">${noImage}</span>
        </div>
        <div class="photo-actions">
          <label class="btn btn-ghost">
            写真を選ぶ
            <input id="f-photo" type="file" accept="image/*" class="visually-hidden">
          </label>
          <button type="button" class="btn btn-ghost" id="f-photo-crop" hidden>範囲を変える</button>
          <button type="button" class="btn btn-ghost" id="f-photo-remove" hidden>写真を外す</button>
        </div>
      </div>

      <div class="field">
        <label for="f-comment">一言コメント<small>（なくても記録できます）</small></label>
        <textarea id="f-comment" rows="3" maxlength="200" placeholder="その時感じたこと">${esc(record?.comment ?? saved0?.comment)}</textarea>
      </div>

      ${members.length ? `
      <div class="field">
        <span class="label">一緒に食べた人<small>（共有すると相手の記録にも並びます）</small></span>
        <div class="with-pick" id="f-with">
          ${members.map((m) => `
            <button type="button" class="with-chip${withUids.has(m.uid) ? ' is-on' : ''}"
              data-with="${m.uid}" aria-pressed="${withUids.has(m.uid)}">
              ${avatarChip(m.nickname, m.avatar)}
              <span class="wc-name">${esc(m.nickname ?? '名無し')}</span>
            </button>`).join('')}
        </div>
      </div>` : allMembers.length ? `
      <div class="field">
        <span class="label">一緒に食べた人</span>
        <p class="hint">フォローしている人がここに並びます。みんなの記録の「ユーザーを探す」からフォローできます。</p>
      </div>` : ''}

      ${!isEdit && me.user ? `
      <label class="check-row">
        <input type="checkbox" id="f-share" ${(saved0 ? saved0.share : shareByDefault) ? 'checked' : ''}>
        <span>記録と同時にみんなへ共有する</span>
      </label>` : ''}

      ${saved0 ? '<p class="hint draft-note">書きかけの内容を復元しました。<button type="button" class="mini-btn" id="f-reset">最初から入力する</button></p>' : ''}

      <p class="form-error" id="f-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" id="f-submit">${isEdit ? '変更を保存' : '記録する'}</button>
      ${isEdit ? '<button type="button" class="btn btn-danger btn-block" id="f-delete">この記録を削除</button>' : ''}
    </form>

    ${isEdit ? shareSection(record) : ''}`;

  const shopSelect = $('#f-shop');
  const newShopInput = $('#f-newshop');
  const newAddressInput = $('#f-newaddress');
  const countHint = $('#f-count');
  const scoreRange = $('#f-score');
  const scoreOut = $('#f-score-out');
  const preview = $('#f-preview');
  const noImageEl = $('#f-noimage');
  const photoInput = $('#f-photo');
  const removeBtn = $('#f-photo-remove');
  const cropBtn = $('#f-photo-crop');
  const errorEl = $('#f-error');

  const addressField = $('#f-address-field');
  const addressInput = $('#f-address');
  let addressShownFor = null; // 直前に住所欄を出したお店（切り替わったときだけ入れ直す）

  // --- お店の選択 ---
  function updateShopUI() {
    const value = shopSelect.value;
    newShopInput.hidden = value !== '__new';
    newAddressInput.hidden = value !== '__new';
    if (value === '__new') {
      countHint.textContent = '初めてのお店です。1回目の記録になります。';
    } else if (value) {
      const n = counts.get(value) ?? 0;
      countHint.textContent = isEdit && value === record.shopId
        ? `このお店の記録は全部で${n}回です。`
        : `このお店の${n + 1}回目の記録になります。`;
    } else {
      countHint.textContent = '';
    }

    // 既存のお店を選んでいるときだけ、住所を直せる欄を出す
    const isExisting = value && value !== '__new';
    addressField.hidden = !isExisting;
    if (isExisting && addressShownFor !== value) {
      addressInput.value = shops.find((s) => s.id === value)?.address ?? '';
      addressShownFor = value;
    }
  }
  shopSelect.onchange = () => {
    updateShopUI();
    if (shopSelect.value === '__new') newShopInput.focus();
  };
  updateShopUI();
  // 書きかけに住所の変更が残っていれば、それを優先する（同じお店を選び直したときだけ）
  if (!addressField.hidden && saved0?.existingAddress !== undefined) {
    addressInput.value = saved0.existingAddress;
  }

  // --- 評価（0〜100点） ---
  const scoreBox = $('#f-score-box');
  const mascotSlot = $('#f-mascot');
  const scoreWord = $('#f-score-word');
  let shownTier = faceTier(score);

  function setScore(value) {
    const n = Math.max(0, Math.min(100, Math.round(value)));
    scoreRange.value = n;
    scoreOut.textContent = n;

    // 表情が変わるときだけ描き直す（毎回描くと湯気の動きが止まるため）
    const tier = faceTier(n);
    if (tier !== shownTier) {
      shownTier = tier;
      mascotSlot.innerHTML = mascot(n);
      scoreWord.textContent = TIER_WORD[tier];
      scoreBox.classList.toggle('is-guilty', tier === 3);
    }
    keepDraft();
  }
  scoreRange.oninput = () => setScore(Number(scoreRange.value));
  app.querySelectorAll('[data-step]').forEach((btn) => {
    btn.onclick = () => setScore(Number(scoreRange.value) + Number(btn.dataset.step));
  });

  // --- 写真 ---
  // photoChange: undefined = 変更なし / null = 外す / Blob = 新しい写真
  let photoChange;
  let previewUrl = null;
  let sourceFile = saved0?.sourceFile ?? null; // 切り抜き直せるよう、選んだ元の写真を覚えておく
  if (saved0?.photoBlob) photoChange = saved0.photoBlob;
  if (saved0?.previewUrl) previewUrl = saved0.previewUrl;

  function showPhoto(url) {
    preview.hidden = !url;
    noImageEl.hidden = Boolean(url);
    removeBtn.hidden = !url;
    cropBtn.hidden = !sourceFile;
    if (url) preview.src = url;
    else preview.removeAttribute('src');
  }
  showPhoto(currentPhotoUrl);

  // 切り抜き画面を開き、決定されたらプレビューに反映する
  async function runCrop(file) {
    errorEl.textContent = '';
    try {
      const blob = await cropImage(file);
      if (!blob) return; // やめるを押した
      sourceFile = file;
      photoChange = blob;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      showPhoto(previewUrl);
      keepDraft();
    } catch (err) {
      console.error(err);
      errorEl.textContent = '写真を読み込めませんでした。別の写真を選んでください。';
    }
  }

  photoInput.onchange = () => {
    const file = photoInput.files?.[0];
    photoInput.value = ''; // 同じ写真をもう一度選べるようにリセット
    if (file) runCrop(file);
  };

  cropBtn.onclick = () => {
    if (sourceFile) runCrop(sourceFile);
  };

  removeBtn.onclick = () => {
    photoChange = null;
    sourceFile = null;
    showPhoto(null);
    keepDraft();
  };

  // --- 一緒に食べた人（押すたびに付け外し） ---
  $('#f-with')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-with]');
    if (!chip) return;
    const uid = chip.dataset.with;
    const on = !withUids.has(uid);
    if (on) withUids.add(uid); else withUids.delete(uid);
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', String(on));
    tap(chip);
    keepDraft();
  });

  // --- 書きかけを覚える（新規記録のときだけ） ---
  function keepDraft() {
    if (isEdit) return;
    draft = {
      shopId: shopSelect.value,
      newShop: newShopInput.value,
      newAddress: newAddressInput.value,
      menu: $('#f-menu').value,
      date: $('#f-date').value,
      score: Number(scoreRange.value),
      comment: $('#f-comment').value,
      withUids: [...withUids],
      existingAddress: addressField.hidden ? undefined : addressInput.value,
      share: $('#f-share')?.checked ?? false,
      photoBlob: photoChange instanceof Blob ? photoChange : null,
      previewUrl,
      sourceFile,
    };
  }

  if (!isEdit) {
    // 入力のたびに覚えるので、途中で別の画面に移っても続きから書ける
    app.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', keepDraft);
      el.addEventListener('change', keepDraft);
    });
  }

  $('#f-reset')?.addEventListener('click', () => {
    clearDraft();
    renderNew({ query: new URLSearchParams() });
  });

  // --- 保存 ---
  $('#rec-form').onsubmit = async (event) => {
    event.preventDefault();
    errorEl.textContent = '';

    const shopValue = shopSelect.value;
    const newName = newShopInput.value.trim();
    const menu = $('#f-menu').value.trim();
    const dateValue = $('#f-date').value;
    const comment = $('#f-comment').value.trim();

    let error = '';
    if (!shopValue) error = 'お店を選んでください。';
    else if (shopValue === '__new' && !newName) error = '店名を入力してください。';
    else if (shopValue === '__new' && shops.some((s) => s.name === newName)) {
      error = `「${newName}」はすでに登録されています。一覧から選んでください。`;
    } else if (!menu) error = '食べたものを入力してください。';
    else if (!dateValue) error = '日付を入力してください。';
    if (error) {
      errorEl.textContent = error;
      return;
    }

    const submitBtn = $('#f-submit');
    submitBtn.disabled = true;

    try {
      let shop = null;
      let shopId = shopValue;
      if (shopValue === '__new') {
        shop = { id: newId(), name: newName, address: newAddressInput.value.trim(), createdAt: Date.now() };
        shopId = shop.id;
      } else {
        // 既存のお店を選んでいる場合、住所欄が変えられていれば一緒に保存する
        const existingShop = shops.find((s) => s.id === shopValue);
        const addressValue = addressInput.value.trim();
        if (existingShop && addressValue !== (existingShop.address ?? '')) {
          shop = { ...existingShop, address: addressValue };
        }
      }

      let photoId = record?.photoId ?? null;
      let newPhoto = null;
      let oldPhotoId = null;
      if (photoChange instanceof Blob) {
        oldPhotoId = photoId;
        photoId = newId();
        newPhoto = { id: photoId, blob: photoChange };
      } else if (photoChange === null && photoId) {
        oldPhotoId = photoId;
        photoId = null;
      }

      const saved = {
        id: record?.id ?? newId(),
        shopId,
        menu,
        date: dateValue,
        score: Number(scoreRange.value),
        comment,
        photoId,
        withUids: [...withUids],
        // 共有中の印は編集しても引き継ぐ（入れ忘れると共有していないことになってしまう）
        postId: record?.postId ?? null,
        createdAt: record?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveRecord({ shop, record: saved, newPhoto, oldPhotoId });
      if (oldPhotoId) forgetPhotoUrl(oldPhotoId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      askPersist();
      lastSavedId = saved.id; // ホームに戻った直後だけ、この一杯について話させる
      if (!isEdit) {
        draft = null; // 記録できたので書きかけは捨てる（表示中のURLはこのあと解放される）
      }

      const name = shop?.name ?? shops.find((s) => s.id === shopId)?.name;
      const nth = (counts.get(shopId) ?? 0) + 1;

      // 記録と同時に共有する場合。保存自体はもう済んでいるので、
      // ここで失敗しても記録が消えることはない。
      const shareNow = $('#f-share')?.checked ?? false;
      if (!isEdit && me.user) shareByDefault = shareNow;
      let shareResult = null; // 共有しなかった:null・できた:true・失敗:false
      if (shareNow) {
        try {
          const postId = await cloud.sharePost({
            uid: me.user.uid,
            nickname: myName(),
            avatar: me.profile?.avatar ?? null,
            shopName: name,
            shopAddress: (shop ?? shops.find((s) => s.id === shopId))?.address ?? '',
            menu: saved.menu,
            date: saved.date,
            score: saved.score,
            comment: saved.comment ?? '',
            withUids: saved.withUids ?? [],
            photo: await photoForShare(saved.photoId),
          });
          await db.put('records', { ...saved, postId });
          shareResult = true;
          await maybeCelebrateBadge(); // 区切りに届いていたらバッジの演出
        } catch (err) {
          console.error(err);
          shareResult = false;
        }
      }

      // 共有済みの記録を編集したときは、みんなの記録の側も書き換える。
      // ここで失敗しても端末の記録はもう保存できているので、知らせるだけにする。
      let sharedGone = false; // 共有先の投稿がもう無かったかどうか
      if (isEdit && saved.postId) {
        try {
          await cloud.updatePost(saved.postId, {
            shopName: name,
            shopAddress: (shop ?? shops.find((s) => s.id === shopId))?.address ?? '',
            menu: saved.menu,
            date: saved.date,
            score: saved.score,
            comment: saved.comment ?? '',
            withUids: saved.withUids ?? [],
            photo: await photoForShare(saved.photoId),
          });
        } catch (err) {
          console.error(err);
          if (isMissingPost(err)) {
            // 共有先の投稿がもう無い。印だけ残っていても直しようがないので静かに外す
            await db.put('records', { ...saved, postId: null });
            saved.postId = null;
            sharedGone = true;
          } else {
            toast('変更は保存しましたが、共有側に反映できませんでした');
          }
        }
      }

      if (saved.score >= GUILTY) {
        await guiltyFlash(isEdit ? `${name}・${saved.score}点` : `${name}（${nth}回目）・${saved.score}点`);
      }

      if (isEdit) {
        if (saved.score < GUILTY) toast(sharedGone ? '変更を保存しました（共有は解除されました）' : '変更を保存しました');
        goBack();
      } else {
        goReplace('#/');
        // ホームに戻ったところで、記録できたこと（と共有できたか）を上に出す
        showDoneBanner({
          title: '記録した！',
          sub: `${name}（${nth}回目）・${saved.score}点`,
          lines: shareResult === null ? []
            : shareResult ? [{ ok: true, text: 'みんなにも共有した' }]
              : [{ ok: false, text: '共有はできなかった。記録の画面からもう一度共有できる' }],
        });
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = '保存できませんでした。もう一度お試しください。';
      submitBtn.disabled = false;
    }
  };

  // --- 削除（編集時のみ） ---
  if (isEdit) {
    $('#f-delete').onclick = async () => {
      if (!confirm('この記録を削除しますか？元には戻せません。')) return;
      // 共有していた場合は、みんなの記録からも消す
      if (record.postId) {
        try {
          await cloud.deletePost(record.postId);
        } catch (err) {
          console.error(err);
        }
      }
      await db.deleteRecord(record);
      if (record.photoId) forgetPhotoUrl(record.photoId);
      toast('記録を削除しました');
      goBack();
    };

    const shopOfRecord = shops.find((s) => s.id === record.shopId);
    setupShare(record, shopOfRecord?.name ?? '（不明なお店）', shopOfRecord?.address ?? '');
  }
}

/* ===================== みんなの記録 ===================== */

// 画面を離れるときに購読をやめるための置き場所
let feedStop = null;
// 「フォロー中」「みんな」のどちらを見ているか。画面を出入りしても覚えておく
let feedTab = 'all';

function stopFeed() {
  if (feedStop) {
    feedStop();
    feedStop = null;
  }
}

// FirestoreのcreatedAtは「サーバー側の時刻」なので、
// 送った直後はまだ空のことがある。その場合は「送信中」と出す。
function whenText(stamp) {
  if (!stamp?.toDate) return '送信中…';
  const d = stamp.toDate();
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// アイコンを設定していない人に使う初期アイコン
const DEFAULT_AVATARS = [
  { id: './avatar-bowl.png', name: 'どんぶり' },
  { id: './avatar-yolk.png', name: '黄身' },
];
const DEFAULT_AVATAR = DEFAULT_AVATARS[0].id;

// 設定されていなければ初期アイコンを使う
const avatarOf = (avatar) => avatar || DEFAULT_AVATAR;

function avatarChip(nickname, avatar) {
  return `<img class="chip-avatar" src="${avatarOf(avatar)}" alt="">`;
}

// 一度読んだプロフィールは覚えておく。
// 投稿に書き込まれた名前やアイコンは投稿した時点のものなので、
// あとからアイコンを変えても古い投稿に反映されない。
// そこで、最新のプロフィールが分かっていればそちらを優先して使う。
const profileCache = new Map();

function avatarFor(uid, nickname, avatar) {
  const p = profileCache.get(uid);
  return avatarChip(p?.nickname ?? nickname, p?.avatar ?? avatar);
}

function nameFor(uid, nickname) {
  return profileCache.get(uid)?.nickname ?? nickname ?? '名無し';
}

// まだ読んでいない人のプロフィールをまとめて取りに行く。
// 新しく読めたものがあれば true を返す（呼び出し側で描き直すため）
async function ensureProfiles(uids) {
  const missing = [...new Set(uids.filter((u) => u && !profileCache.has(u)))];
  if (!missing.length) return false;
  const got = await Promise.all(missing.map(async (uid) => {
    try {
      return [uid, await cloud.getProfile(uid)];
    } catch {
      return [uid, null];
    }
  }));
  got.forEach(([uid, profile]) => profileCache.set(uid, profile));
  return true;
}

/* ---------- 身内のメンバー一覧（「一緒に食べた人」を選ぶため） ---------- */

// 一度読んだら覚えておく。記録画面を開くたびに取りに行かなくて済む。
// 新しい人が入ったときのために、アプリを開き直すと読み直しになる。
let memberCache = null;

async function loadMembers() {
  if (memberCache) return memberCache;
  if (!me.user) return [];
  try {
    const list = await cloud.getMembers();
    // 自分は「一緒に食べた人」に選べないので、ここで外しておく
    memberCache = list.filter((m) => m.uid !== me.user.uid);
    // ついでにプロフィールも覚えておくと、名前やアイコンを引くのが速くなる
    memberCache.forEach((m) => { if (!profileCache.has(m.uid)) profileCache.set(m.uid, m); });
    return memberCache;
  } catch (err) {
    console.error(err);
    return []; // 読めなくても記録そのものは続けられるようにする
  }
}

// ボタンを押した感触。Androidは振動し、iPhoneはWebに振動の仕組みがないため
// 押し込むような動き（CSSの is-pop）で代える。
//
// ギルティを押すと一覧が描き直されてボタンが作り直されるので、
// 直前に押したものを覚えておき、描き直したあとにも動きを付け直す。
let popKey = null;
let popBurst = false;

function tap(el, key = null, burst = false) {
  navigator.vibrate?.(12);
  popKey = key;
  popBurst = burst;
  if (key) setTimeout(() => { if (popKey === key) popKey = null; }, 600);
  if (!el) return;
  el.classList.remove('is-pop', 'is-burst');
  void el.offsetWidth; // 連打でも毎回動かすための作り直し
  el.classList.add('is-pop');
  if (burst) el.classList.add('is-burst'); // 付けたときだけ光らせる
}

// 描き直した直後に、さっき押したボタンの動きを付け直す
function restorePop(root) {
  if (!popKey) return;
  const btn = root.querySelector(`[data-guilty="${popKey}"], [data-comment-guilty="${popKey}"]`);
  if (!btn) return;
  btn.classList.add('is-pop');
  if (popBurst) btn.classList.add('is-burst');
}

// 押した瞬間に飛ぶきらめき（4方向）
const SPARKS = '<i class="gb-spark s1"></i><i class="gb-spark s2"></i><i class="gb-spark s3"></i><i class="gb-spark s4"></i>';

// ギルティボタン。朱色の判子を押すイメージ
function guiltyButton(post) {
  const uids = post.guiltyUids ?? [];
  const on = me.user ? uids.includes(me.user.uid) : false;
  return `<button type="button" class="guilty-btn${on ? ' is-on' : ''}" data-guilty="${post.id}"
    aria-label="ギルティ ${uids.length}" aria-pressed="${on}">
    <span class="gb-stamp">罪${SPARKS}</span>
    <span class="gb-count">${uids.length}</span>
  </button>`;
}

// 吹き出しのアイコン（コメント）
function commentIcon() {
  return `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M3 4.5h14v9H8.5L4.5 17v-3.5H3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  </svg>`;
}

// 「…」（自分の投稿の操作メニュー）
function kebabIcon() {
  return `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <circle cx="4" cy="10" r="1.6" fill="currentColor"/>
    <circle cx="10" cy="10" r="1.6" fill="currentColor"/>
    <circle cx="16" cy="10" r="1.6" fill="currentColor"/>
  </svg>`;
}

// 自分の投稿の「…」を押したときに出る、編集・削除の小さなメニュー
function openPostMenu(anchor, postId) {
  if (document.getElementById('post-menu')) {
    document.getElementById('post-menu').remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'post-menu';
  menu.className = 'avatar-menu';
  menu.innerHTML = `
    <button type="button" class="am-item" data-pm="edit">編集</button>
    <button type="button" class="am-item is-quiet" data-pm="delete">削除</button>`;
  document.body.appendChild(menu);

  const box = anchor.getBoundingClientRect();
  menu.style.top = `${box.bottom + 8}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;

  function close() {
    menu.remove();
    document.removeEventListener('pointerdown', onOutside, true);
  }
  function onOutside(event) {
    if (!menu.contains(event.target) && event.target !== anchor) close();
  }
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

  menu.addEventListener('click', async (event) => {
    const action = event.target.dataset.pm;
    if (!action) return;
    close();
    if (action === 'edit') await editSharedPost(postId);
    else if (action === 'delete') await deleteSharedPost(postId);
  });
}

// 「編集」：この投稿のもとになった端末側の記録を開く。
// 記録そのものの編集画面（renderEdit）は共有中なら保存のたびに投稿へも反映されるので、
// 住所を含めてすべての項目をそこでまとめて直せる。
async function editSharedPost(postId) {
  const found = await shopForPost(postId);
  if (!found) {
    toast('この端末に元の記録が見つかりませんでした');
    return;
  }
  location.hash = `#/edit/${found.record.id}`;
}

// 「削除」：みんなの記録から消す。端末側の記録は残り、共有中の印だけ外れる
async function deleteSharedPost(postId) {
  if (!confirm('この投稿をみんなの記録から削除しますか？元には戻せません。')) return;
  try {
    await cloud.deletePost(postId);
    await clearLocalPostLink(postId);
    toast('投稿を削除しました');
    const path = (location.hash.slice(1) || '/').split('?')[0];
    if (path.startsWith('/post/')) location.hash = '#/feed';
    // 自動では更新されない一覧（自分の投稿・プロフィール）は描き直して消えたことを見せる
    else if (path === '/myposts' || path.startsWith('/posts/') || path.startsWith('/user/')) router();
  } catch (err) {
    console.error(err);
    toast(shareErrorMessage(err));
  }
}

// 一覧では説明文を3行までにして、長いときは「続きを読む」を添える。
// 詳細画面（full: true）では全文を、改行もそのまま出す
const POST_COMMENT_PREVIEW = 70; // これより長い（または改行が多い）ときに「続きを読む」を出す

function postCard(post, { withLastComment = true, full = false } = {}) {
  // 写真は押すと直接拡大表示になる。投稿本文への遷移とは別の操作にするため、
  // <a class="post-body"> の中にあってもボタンとして扱う（クリックはJS側で止める）。
  const photo = post.photo
    ? `<button type="button" class="post-photo is-zoomable" data-zoom aria-label="写真を拡大">
         <img src="${post.photo}" alt="" loading="lazy">
       </button>`
    : '';
  const comment = (post.comment ?? '').trim();
  const longComment = !full
    && (comment.length > POST_COMMENT_PREVIEW || comment.split('\n').length > 3);
  const mine = Boolean(me.user) && post.uid === me.user.uid;

  // 一緒に食べた人。名前は投稿時のものではなく、読めていれば最新のものを使う
  const withUids = post.withUids ?? [];
  const withLine = withUids.length
    ? `<div class="post-with">
         ${withUids.map((uid) => `
           <a class="post-with-one" href="#/user/${uid}">
             ${avatarFor(uid, null, null)}
             <span>${esc(nameFor(uid, null))}</span>
           </a>`).join('')}
         <span class="post-with-tail">と一緒に</span>
       </div>`
    : '';

  return `
    <li class="post" data-post-id="${post.id}">
      <div class="post-head">
        <a class="post-user" href="#/user/${post.uid}">
          ${avatarFor(post.uid, post.nickname, post.avatar)}
          <span class="post-who">${esc(nameFor(post.uid, post.nickname))}</span>
        </a>
        <span class="post-when">${esc(whenText(post.createdAt))}</span>
        ${mine ? `<button type="button" class="post-kebab" data-postmenu="${post.id}" aria-haspopup="true" aria-label="投稿の操作">${kebabIcon()}</button>` : ''}
      </div>
      <a class="post-body${post.photo ? '' : ' no-photo'}" href="#/post/${post.id}">
        ${photo}
        <div class="post-lines">
          <span class="post-shop">${esc(post.shopName)}</span>
          <span class="post-menu">${esc(post.menu)}</span>
        </div>
        <span class="post-score${post.score >= GUILTY ? ' is-guilty' : ''}">${post.score}<small>点</small></span>
        ${comment ? `
          <span class="post-comment${full ? ' is-full' : ''}">${esc(comment)}</span>
          ${longComment ? '<span class="post-more">続きを読む</span>' : ''}` : ''}
      </a>
      ${withLine}
      <div class="post-foot">
        ${guiltyButton(post)}
        <a class="icon-btn" href="#/post/${post.id}?comment=1" aria-label="コメントを書く">
          ${commentIcon()}<span class="ib-count">${post.commentCount ?? 0}</span>
        </a>
        ${post.shopAddress
          ? `<a class="post-link map-link" href="${mapUrl(post.shopName, post.shopAddress)}" target="_blank" rel="noopener">地図</a>`
          : ''}
      </div>
      ${withLastComment && post.lastComment
        ? `<a class="post-lastcomment" href="#/post/${post.id}">
             ${avatarFor(post.lastComment.uid, post.lastComment.nickname, post.lastComment.avatar)}
             <span class="plc-body">
               <span class="plc-who">${esc(nameFor(post.lastComment.uid, post.lastComment.nickname))}</span>
               <span class="plc-text">${esc(post.lastComment.text)}</span>
             </span>
             ${post.commentCount > 1 ? `<span class="plc-more">他${post.commentCount - 1}件</span>` : ''}
           </a>`
        : ''}
    </li>`;
}

async function renderFeed() {
  stopFeed();

  if (!me.ready) {
    app.innerHTML = header('みんなの記録') + '<p class="empty">確認しています…</p>';
    return;
  }
  if (!me.user) {
    app.innerHTML = header('みんなの記録') + `
      <p class="empty">ログインすると、身内が共有した記録を見られます。</p>
      <a class="btn btn-primary btn-block" href="#/account">ログイン</a>`;
    return;
  }

  markFeedSeen(); // 開いた時点で既読にする

  // 開くたびに「みんな」から始める（前に見ていたタブは引き継がない）
  feedTab = 'all';
  const hasFollows = followUids().length > 0;

  app.innerHTML = header('みんなの記録') + `
    <a class="search-entry" href="#/search">${searchIcon()}<span>ユーザーを探す</span></a>` + (hasFollows ? `
    <div class="feed-tabs" role="tablist">
      <button type="button" class="feed-tab${feedTab === 'all' ? ' is-on' : ''}" data-feedtab="all" role="tab" aria-selected="${feedTab === 'all'}">みんな</button>
      <button type="button" class="feed-tab${feedTab === 'following' ? ' is-on' : ''}" data-feedtab="following" role="tab" aria-selected="${feedTab === 'following'}">フォロー中</button>
    </div>` : '')
    + '<ul class="post-list" id="feed"><li class="empty">読み込んでいます…</li></ul>';
  const list = $('#feed');

  let latestPosts = [];
  let allPosts = [];

  function visiblePosts() {
    if (feedTab !== 'following') return allPosts;
    return allPosts.filter((p) => p.uid === me.user.uid || followUids().includes(p.uid));
  }

  function drawFeed(posts) {
    allPosts = posts;
    latestPosts = visiblePosts();
    if (!document.body.contains(list)) return; // もう別の画面に移っている
    list.innerHTML = latestPosts.length
      ? latestPosts.map(postCard).join('')
      : feedTab === 'following'
        ? '<li class="empty">フォロー中の人の共有がまだありません。</li>'
        : '<li class="empty">まだ誰も共有していません。記録の編集画面から共有できます。</li>';
    restorePop(list);
  }

  $('.feed-tabs')?.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('[data-feedtab]');
    if (!tabBtn || tabBtn.dataset.feedtab === feedTab) return;
    feedTab = tabBtn.dataset.feedtab;
    app.querySelectorAll('.feed-tab').forEach((b) => {
      const on = b.dataset.feedtab === feedTab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    drawFeed(allPosts);
  });

  // 長押しで、誰が押したのかを見る
  setupLongPress(list, '[data-guilty]', (btn) => {
    const post = latestPosts.find((p) => p.id === btn.dataset.guilty);
    showGuiltyList(post?.guiltyUids ?? []);
  });

  feedStop = cloud.watchFeed(
    async (posts) => {
      drawFeed(posts);
      // 投稿に書かれた名前やアイコンは投稿時点のもの。
      // 最新のプロフィールが読めたら、もう一度描き直す
      const uids = posts.flatMap((p) => [p.uid, p.lastComment?.uid, ...(p.withUids ?? [])]);
      if (await ensureProfiles(uids)) drawFeed(posts);
    },
    (err) => {
      console.error(err);
      list.innerHTML = `<li class="empty">${esc(shareErrorMessage(err))}</li>`;
    },
  );

  // ギルティボタンは押すたびに書き込むので、一覧全体ではなく押された1つだけ相手にする
  list.onclick = async (event) => {
    // 写真を押したら、本文への遷移はせず直接拡大表示にする
    const zoomBtn = event.target.closest('[data-zoom]');
    if (zoomBtn) {
      event.preventDefault();
      const post = latestPosts.find((p) => p.id === zoomBtn.closest('.post')?.dataset.postId);
      if (post?.photo) openPhoto(post.photo);
      return;
    }

    const btn = event.target.closest('[data-guilty]');
    if (!btn) return;
    event.preventDefault();
    const on = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', on); // 通信を待たずに見た目を変える
    tap(btn, btn.dataset.guilty, on);
    try {
      await cloud.toggleGuilty(btn.dataset.guilty, me.user.uid, on);
    } catch (err) {
      console.error(err);
      btn.classList.toggle('is-on', !on); // 失敗したら戻す
      toast('うまくいきませんでした');
    }
  };
}

// ギルティを押した人の一覧を出す
async function showGuiltyList(uids) {
  const host = document.createElement('div');
  host.className = 'sheet';
  host.innerHTML = `<div class="sheet-box">
    <h2 class="sheet-title">ギルティした人</h2>
    <ul class="sheet-list"><li class="empty">読み込んでいます…</li></ul>
    <button type="button" class="btn btn-ghost btn-block" data-close>閉じる</button>
  </div>`;
  document.body.appendChild(host);
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]') || !event.target.closest('.sheet-box')) host.remove();
  });

  await ensureProfiles(uids);
  const list = host.querySelector('.sheet-list');
  if (!document.body.contains(list)) return;
  list.innerHTML = uids.length
    ? uids.map((uid) => {
      const p = profileCache.get(uid);
      const name = p?.nickname ?? '名無し';
      return `<li class="sheet-row">${avatarChip(name, p?.avatar)}<span>${esc(name)}</span></li>`;
    }).join('')
    : '<li class="empty">まだ誰も押していません。</li>';
}

// ボタンを長押ししたときだけ別の動きをさせる。
// 押したままにすると onLong が呼ばれ、そのあとの通常のタップは無視される。
function setupLongPress(root, selector, onLong) {
  let timer = null;
  let fired = false;

  const cancel = () => { clearTimeout(timer); timer = null; };

  root.addEventListener('pointerdown', (event) => {
    const btn = event.target.closest(selector);
    if (!btn) return;
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      navigator.vibrate?.(20);
      onLong(btn);
    }, 450);
  });

  ['pointerup', 'pointercancel', 'pointermove', 'pointerleave'].forEach((type) => {
    root.addEventListener(type, cancel);
  });

  // 長押しのあとに続けて起きるタップを止める
  root.addEventListener('click', (event) => {
    if (!fired) return;
    if (!event.target.closest(selector)) return;
    fired = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
}

// 写真を画面いっぱいに開く。2本指でつまむと拡大、ドラッグで動かせる。
function openPhoto(src) {
  const host = document.createElement('div');
  host.className = 'viewer';
  host.innerHTML = `
    <button type="button" class="viewer-close" data-close aria-label="閉じる">×</button>
    <div class="viewer-stage"><img class="viewer-img" src="${src}" alt="" draggable="false"></div>`;
  document.body.appendChild(host);
  document.body.classList.add('no-scroll');

  const img = host.querySelector('.viewer-img');
  const stage = host.querySelector('.viewer-stage');
  // 写真そのものをつまんで持ち出す動き（ブラウザ標準）が始まると、スワイプが途中で切れるので止める
  stage.addEventListener('dragstart', (event) => event.preventDefault());
  let k = 1;   // 拡大の倍率
  let tx = 0;  // 位置
  let ty = 0;

  function apply() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  const points = new Map();
  let pinch = null;

  // 等倍のときに下へスワイプすると閉じる（写真アプリやSNSと同じ操作）。
  // 指に合わせて写真が下がり、背景が薄くなる。一定以上引くか、素早く払うと閉じる
  let pull = null;      // { startX, startY, startAt, dy, active }
  let dragged = false;  // 指を動かした直後のタップ（クリック）を無視するため

  function setPull(dy) {
    img.style.transform = `translate(0px, ${dy}px) scale(${Math.max(0.85, 1 - dy / 1600)})`;
    host.style.backgroundColor = `rgba(8, 7, 6, ${Math.max(0.35, 0.97 - dy / 500)})`;
  }

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = null;
    dragged = false;
    pull = points.size === 1 && k === 1
      ? { startX: event.clientX, startY: event.clientY, startAt: Date.now(), dy: 0, active: false }
      : null;
  });

  stage.addEventListener('pointermove', (event) => {
    if (!points.has(event.pointerId)) return;
    const prev = points.get(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (points.size >= 2) {
      if (pull?.active) { img.style.transition = ''; host.style.backgroundColor = ''; }
      pull = null; // 2本指になったら、拡大の操作として扱う
      const [a, b] = [...points.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) k = Math.max(1, Math.min(5, k * (dist / pinch.dist)));
      pinch = { dist };
      if (k === 1) { tx = 0; ty = 0; }
      apply();
    } else if (k > 1) {
      tx += event.clientX - prev.x;
      ty += event.clientY - prev.y;
      dragged = true;
      apply();
    } else if (pull) {
      const dx = event.clientX - pull.startX;
      const dy = event.clientY - pull.startY;
      // 最初の動きが下向きのときだけ「閉じる操作」として始める
      if (!pull.active) {
        if (dy > 10 && dy > Math.abs(dx)) {
          pull.active = true;
          img.style.transition = 'none';
        } else if (Math.abs(dx) > 10 || dy < -10) {
          pull = null;
          return;
        } else {
          return;
        }
      }
      dragged = true;
      pull.dy = Math.max(0, dy);
      setPull(pull.dy);
    }
  });

  function release(event) {
    points.delete(event.pointerId);
    if (points.size < 2) pinch = null;
    if (!pull?.active || points.size) return;
    const { dy, startAt } = pull;
    pull = null;
    const speed = dy / Math.max(1, Date.now() - startAt); // 1ミリ秒あたりに動いた距離
    if (dy > 110 || (dy > 40 && speed > 0.6)) {
      // 下へ流しながら閉じる
      img.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
      host.style.transition = 'background-color 0.2s ease-in';
      img.style.transform = `translate(0px, ${window.innerHeight}px) scale(0.85)`;
      img.style.opacity = '0';
      host.style.backgroundColor = 'rgba(8, 7, 6, 0)';
      setTimeout(close, 200);
    } else {
      // 引きが足りなければ元の位置に戻す
      img.style.transition = 'transform 0.2s ease-out';
      host.style.transition = 'background-color 0.2s ease-out';
      apply();
      host.style.backgroundColor = '';
      setTimeout(() => { img.style.transition = ''; host.style.transition = ''; }, 220);
    }
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // 画像を2回たたくと、拡大と等倍を行き来する
  let lastTap = 0;
  stage.addEventListener('click', () => {
    if (dragged) return; // スワイプのあとのタップは数えない
    const now = Date.now();
    if (now - lastTap < 300) {
      k = k > 1 ? 1 : 2.5;
      tx = 0;
      ty = 0;
      apply();
    }
    lastTap = now;
  });

  function close() {
    document.body.classList.remove('no-scroll');
    host.remove();
  }

  host.addEventListener('click', (event) => {
    if (dragged && !event.target.closest('[data-close]')) return; // スワイプで戻したときは閉じない
    // 画像の外側を押すか、×を押すと閉じる
    if (event.target.closest('[data-close]') || !event.target.closest('.viewer-img')) close();
  });
}

/* ===================== 共有された記録の詳細（コメント） ===================== */

let postStop = [];

function stopPost() {
  postStop.forEach((fn) => fn());
  postStop = [];
}

async function renderPost({ id, query }) {
  stopPost();

  if (!me.user) {
    goReplace('#/feed');
    return;
  }

  app.innerHTML = header('記録', { back: '#/feed', backLabel: 'みんなの記録' }) + `
    <div id="post-slot"><p class="empty">読み込んでいます…</p></div>

    <div class="comment-open">
      <button type="button" class="icon-btn is-big" id="comment-open" aria-expanded="false">
        ${commentIcon()}<span>コメントを書く</span>
      </button>
    </div>

    <div id="comment-form-home">
      <form class="comment-form" id="comment-form" hidden>
        <span class="reply-to" id="reply-to" hidden></span>
        <textarea id="comment-text" rows="2" maxlength="200" placeholder="コメントを書く"></textarea>
        <div class="comment-form-foot">
          <button type="button" class="btn btn-ghost" id="comment-cancel">やめる</button>
          <button type="submit" class="btn btn-primary" id="comment-send">送信</button>
        </div>
      </form>
    </div>

    <h2 class="section-title">コメント</h2>
    <ul class="comment-list" id="comment-list"><li class="empty">読み込んでいます…</li></ul>`;

  const slot = $('#post-slot');
  const list = $('#comment-list');
  const form = $('#comment-form');
  let thisPost = null;
  let theseComments = [];

  // 写真を押したら直接拡大表示にする
  slot.addEventListener('click', (event) => {
    const zoomBtn = event.target.closest('[data-zoom]');
    if (zoomBtn && thisPost?.photo) {
      event.preventDefault();
      openPhoto(thisPost.photo);
    }
  });

  // 長押しで、誰が押したのかを見る
  setupLongPress(slot, '[data-guilty]', () => showGuiltyList(thisPost?.guiltyUids ?? []));
  setupLongPress(list, '[data-comment-guilty]', (btn) => {
    const c = theseComments.find((x) => x.id === btn.dataset.commentGuilty);
    showGuiltyList(c?.guiltyUids ?? []);
  });
  const openBtn = $('#comment-open');
  const box = $('#comment-text');
  const replyLabel = $('#reply-to');
  const formHome = $('#comment-form-home');

  // 返信のときは、入力欄を返信先のコメント（とその返信）のすぐ下に移す。
  // 送った返信が出る場所と、書いている場所をそろえるため。
  // コメント一覧は描き直されるたびに中身が入れ替わるので、入力欄はこの li に入れて
  // 描き直しのあとに差し込み直す（入力中の文字はそのまま残る）。
  const replySlot = document.createElement('li');
  replySlot.className = 'comment-reply-slot';

  // 返信先。{ threadId: 返信を並べる元のコメント, uid, nickname: 返信する相手 }。
  // 通常のコメントなら null
  let replyTo = null;

  // 入力欄を今の状態に合った場所へ置く
  function placeForm() {
    if (replyTo) {
      const rows = list.querySelectorAll(`[data-thread="${replyTo.threadId}"]`);
      const last = rows[rows.length - 1];
      if (last) {
        if (replySlot.firstChild !== form) replySlot.appendChild(form);
        last.after(replySlot);
        return;
      }
      // 返信先のコメントが消えた。上の入力欄で、普通のコメントとして書けるようにする
      setReplyTo(null);
    }
    replySlot.remove();
    if (form.parentElement !== formHome) formHome.appendChild(form);
  }

  function setReplyTo(next) {
    replyTo = next;
    replyLabel.hidden = !next;
    replyLabel.textContent = next ? `${next.nickname} さんへの返信` : '';
    box.placeholder = next ? '返信を書く' : 'コメントを書く';
  }

  function openForm() {
    placeForm();
    form.hidden = false;
    openBtn.setAttribute('aria-expanded', String(!replyTo));
    form.classList.remove('is-opening');
    void form.offsetWidth;
    form.classList.add('is-opening'); // すっと開く動き
    // キーボードを出すため、押した操作の中ですぐ入力欄を選ぶ（画面の位置はこのあと合わせる）
    box.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function closeForm() {
    form.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    setReplyTo(null);
    box.value = '';
    placeForm(); // 上の定位置に戻す
  }

  // 上の「コメントを書く」：普通のコメントを書く。返信を書いている途中なら、そちらはやめる
  openBtn.onclick = () => {
    if (!form.hidden && !replyTo) { closeForm(); return; }
    if (replyTo) box.value = '';
    setReplyTo(null);
    openForm();
  };

  // コメントアイコンから来たときは、最初から入力欄を開いておく
  if (query?.get('comment') === '1') openForm();
  $('#comment-cancel').onclick = closeForm;

  postStop.push(cloud.watchPost(
    id,
    async (post) => {
      if (!document.body.contains(slot)) return;
      if (!post) {
        slot.innerHTML = '<p class="empty">この記録は削除されました。</p>';
        return;
      }
      // 一緒に食べた人の名前を出すために、先にプロフィールを読んでおく
      await ensureProfiles(post.withUids ?? []);
      if (!document.body.contains(slot)) return;
      thisPost = post;
      slot.innerHTML = `<ul class="post-list">${postCard(post, { withLastComment: false, full: true })}</ul>`;
      restorePop(slot);
      const btn = slot.querySelector('[data-guilty]');
      if (btn) {
        btn.onclick = async () => {
          const on = !btn.classList.contains('is-on');
          btn.classList.toggle('is-on', on);
          tap(btn, post.id, on);
          try {
            await cloud.toggleGuilty(post.id, me.user.uid, on);
          } catch (err) {
            console.error(err);
            btn.classList.toggle('is-on', !on);
            toast('うまくいきませんでした');
          }
        };
      }
    },
    (err) => {
      console.error(err);
      slot.innerHTML = `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    },
  ));

  function drawComments(comments) {
    theseComments = comments;
    if (!document.body.contains(list)) return;
    const typing = document.activeElement === box;
    replySlot.remove(); // 描き直しで入力欄ごと消えないよう、先に外しておく
    list.innerHTML = comments.length ? commentTree(comments) : '<li class="empty">まだコメントはありません。</li>';
    restorePop(list);
    if (replyTo) {
      placeForm();
      if (typing) box.focus({ preventScroll: true });
    }
  }

  postStop.push(cloud.watchComments(
    id,
    async (comments) => {
      drawComments(comments);
      if (await ensureProfiles(comments.map((c) => c.uid))) drawComments(comments);
    },
    (err) => {
      console.error(err);
      list.innerHTML = `<li class="empty">${esc(shareErrorMessage(err))}</li>`;
    },
  ));

  list.onclick = async (event) => {
    // 返信する
    // 返信の返信も、元のコメントの下に並べる（段は1段のまま）。誰あての返信かは名前で残す
    const replyBtn = event.target.closest('[data-reply]');
    if (replyBtn) {
      const next = {
        threadId: replyBtn.dataset.reply,
        uid: replyBtn.dataset.replyUid,
        nickname: replyBtn.dataset.replyName,
      };
      // 別の相手への返信に切り替えたら、書きかけは捨てる（宛先と中身が食い違わないように）
      const same = replyTo && replyTo.threadId === next.threadId && replyTo.uid === next.uid;
      if (!same) box.value = '';
      setReplyTo(next);
      openForm();
      return;
    }

    // コメントにギルティ
    const gBtn = event.target.closest('[data-comment-guilty]');
    if (gBtn) {
      const on = !gBtn.classList.contains('is-on');
      gBtn.classList.toggle('is-on', on);
      tap(gBtn, gBtn.dataset.commentGuilty, on);
      try {
        await cloud.toggleCommentGuilty(id, gBtn.dataset.commentGuilty, me.user.uid, on);
      } catch (err) {
        console.error(err);
        gBtn.classList.toggle('is-on', !on);
        toast('うまくいきませんでした');
      }
      return;
    }

    // 自分のコメントを削除
    const delBtn = event.target.closest('[data-del-comment]');
    if (delBtn) {
      if (!confirm('このコメントを削除しますか？')) return;
      try {
        await cloud.deleteComment(id, delBtn.dataset.delComment);
      } catch (err) {
        console.error(err);
        toast('削除できませんでした');
      }
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    const sendBtn = $('#comment-send');
    sendBtn.disabled = true;
    try {
      await cloud.addComment(id, {
        uid: me.user.uid,
        nickname: myName(),
        avatar: me.profile?.avatar ?? null,
        text,
        parentId: replyTo?.threadId ?? null,
        // 誰への返信か（通知の宛先と、返信の返信に「〇〇さんへ」と出すのに使う）
        replyToUid: replyTo?.uid ?? null,
        replyToName: replyTo?.nickname ?? null,
      });
      closeForm();
    } catch (err) {
      console.error(err);
      // 次に同じことが起きたときに原因を追えるよう、理由の記号も添える
      const reason = err?.code || err?.name || '';
      toast(`${shareErrorMessage(err)}${reason ? `（${reason}）` : ''}`);
    }
    sendBtn.disabled = false;
  };

}

// コメントを「元のコメント → その返信」の順に組み立てる（段は1段まで）。
// 返信の返信も、元のコメントの下に並べる
function commentTree(comments) {
  const parents = comments.filter((c) => !c.parentId);
  const repliesOf = new Map();
  for (const c of comments) {
    if (!c.parentId) continue;
    if (!repliesOf.has(c.parentId)) repliesOf.set(c.parentId, []);
    repliesOf.get(c.parentId).push(c);
  }
  // 返信先が消えているものは、独立したコメントとして残す
  const orphans = comments.filter((c) => c.parentId && !comments.some((x) => x.id === c.parentId));

  return [...parents, ...orphans]
    .map((c) => commentRow(c) + (repliesOf.get(c.id) ?? []).map((r) => commentRow(r, c)).join(''))
    .join('');
}

function commentGuiltyButton(c) {
  const uids = c.guiltyUids ?? [];
  const on = me.user ? uids.includes(me.user.uid) : false;
  return `<button type="button" class="guilty-btn is-mini${on ? ' is-on' : ''}" data-comment-guilty="${c.id}"
    aria-label="ギルティ ${uids.length}" aria-pressed="${on}">
    <span class="gb-stamp">罪${SPARKS}</span>
    ${uids.length ? `<span class="gb-count">${uids.length}</span>` : ''}
  </button>`;
}

// parent を渡すと「返信」として、元のコメントの下に1段下げて出す
function commentRow(c, parent = null) {
  const mine = me.user && c.uid === me.user.uid;
  const threadId = parent ? parent.id : c.id; // 返信はどれも、元のコメントの下に並ぶ
  // 返信の返信（元のコメントを書いた人以外へ）のときだけ、誰あてかを添える
  const toName = parent && c.replyToUid && c.replyToUid !== parent.uid
    ? nameFor(c.replyToUid, c.replyToName)
    : null;
  return `
    <li class="comment${parent ? ' is-reply' : ''}" data-thread="${threadId}">
      <a class="comment-user" href="#/user/${c.uid}">${avatarFor(c.uid, c.nickname, c.avatar)}</a>
      <div class="comment-body">
        <span class="comment-head">
          <a class="comment-who" href="#/user/${c.uid}">${esc(nameFor(c.uid, c.nickname))}</a>
          <span class="comment-when">${esc(whenText(c.createdAt))}</span>
        </span>
        <p class="comment-text">${toName ? `<span class="comment-to">@${esc(toName)}</span> ` : ''}${esc(c.text)}</p>
        <div class="comment-actions">
          ${commentGuiltyButton(c)}
          <button type="button" class="mini-btn" data-reply="${threadId}" data-reply-uid="${c.uid}"
            data-reply-name="${esc(nameFor(c.uid, c.nickname))}">返信</button>
          ${mine ? `<button type="button" class="mini-btn is-quiet" data-del-comment="${c.id}">削除</button>` : ''}
        </div>
      </div>
    </li>`;
}

/* ===================== ほかの人のページ ===================== */

// ベルのマーク。muted=true なら斜線を1本引いて、音が出ていないことを表す
function bellIcon(muted) {
  const bell = '<path d="M12 3.5a5.2 5.2 0 0 0-5.2 5.2v3.1L5.2 15h13.6l-1.6-3.2V8.7A5.2 5.2 0 0 0 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M10 17.6a2.1 2.1 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  // 音が出ている表現：ベルの両脇に短い線を添える
  const waves = muted ? ''
    : '<path d="M19.6 6.2a7.4 7.4 0 0 1 1.6 3M4.4 6.2a7.4 7.4 0 0 0-1.6 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  const slash = muted
    ? '<path d="M4 3.6 20.4 20.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '';
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${bell}${waves}${slash}</svg>`;
}

// ほかの人の図鑑やカレンダーは、その人が共有した記録から組み立てる。
// 相手の端末の中身は見られないので、見えるのは共有されたものだけ。
/* ===================== フォロー中・フォロワーの一覧 ===================== */

// 投稿カードの一覧に、写真の拡大・ギルティ・長押しでの一覧表示を付ける。
// 「みんなの記録」と同じ動きを、他の画面の一覧でも使えるようにまとめたもの。
// getPosts には、今その一覧に並んでいる投稿の配列を返す関数を渡す。
function wirePostList(list, getPosts) {
  setupLongPress(list, '[data-guilty]', (btn) => {
    const post = getPosts().find((p) => p.id === btn.dataset.guilty);
    showGuiltyList(post?.guiltyUids ?? []);
  });

  list.addEventListener('click', async (event) => {
    const zoomBtn = event.target.closest('[data-zoom]');
    if (zoomBtn) {
      event.preventDefault();
      const post = getPosts().find((p) => p.id === zoomBtn.closest('.post')?.dataset.postId);
      if (post?.photo) openPhoto(post.photo);
      return;
    }

    const btn = event.target.closest('[data-guilty]');
    if (!btn || !me.user) return;
    event.preventDefault();
    const on = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', on); // 通信を待たずに見た目を変える
    tap(btn, btn.dataset.guilty, on);
    const post = getPosts().find((p) => p.id === btn.dataset.guilty);
    try {
      await cloud.toggleGuilty(btn.dataset.guilty, me.user.uid, on);
      if (post) {
        const set = new Set(post.guiltyUids ?? []);
        if (on) set.add(me.user.uid); else set.delete(me.user.uid);
        post.guiltyUids = [...set]; // 長押しの一覧や描き直しでずれないように
      }
    } catch (err) {
      console.error(err);
      btn.classList.toggle('is-on', !on); // 失敗したら戻す
      toast('うまくいきませんでした');
    }
  });
}

// 共有した記録の一覧。自分の分（#/myposts）も、ほかの人の分（#/posts/uid）もここで出す。
// 図鑑のカードから来たときは ?shop=店名 で、その店の投稿だけに絞る
const MYPOSTS_SORTS = {
  new: { label: '新しい順', fn: (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) },
  old: { label: '古い順', fn: (a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) },
  score: { label: '点数順', fn: (a, b) => b.score - a.score || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) },
  guilty: { label: 'ギルティ順', fn: (a, b) => (b.guiltyUids?.length ?? 0) - (a.guiltyUids?.length ?? 0) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) },
  comment: { label: 'コメント順', fn: (a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) },
};
let myPostsSort = 'new'; // 並び順は、アプリを開いている間だけ覚えておく

function renderMyPosts() {
  if (!me.user) return renderUserPosts({ id: null, query: new URLSearchParams() });
  return renderUserPosts({ id: me.user.uid, query: new URLSearchParams() });
}

async function renderUserPosts({ id, query }) {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const isMe = Boolean(me.user) && (id == null || id === me.user.uid);
  const shopFilter = query?.get('shop') ?? '';
  const titleOf = (name) => (isMe ? '自分の投稿' : `${name ?? ''}の記録`);
  if (!me.ready) {
    app.innerHTML = header('共有した記録') + '<p class="empty">確認しています…</p>';
    return; // ログインの確認が終わったら描き直される
  }
  if (!me.user) {
    app.innerHTML = header('共有した記録') + `
      <p class="empty">ログインすると、共有した記録をまとめて見られます。</p>
      <a class="btn btn-primary btn-block" href="#/account">ログイン</a>`;
    return;
  }

  const uid = id ?? me.user.uid;
  const backTo = { back: `#/user/${uid}`, backLabel: 'プロフィール' };
  const name = isMe ? myName() : nameFor(uid, null);

  // 先に枠を出しておき、読めた時点で中身を入れる
  app.innerHTML = header(titleOf(name), backTo) + `
    <section class="myposts">
      ${shopFilter ? `
        <div class="posts-filter">
          <span>「${esc(shopFilter)}」の記録だけ表示中</span>
          <a href="#/posts/${uid}" class="posts-filter-clear">すべて見る</a>
        </div>` : ''}
      <dl class="shop-stats" id="mp-stats"></dl>
      <div id="mp-sort"></div>
      <ul class="post-list" id="myposts-list"><li class="empty">読み込んでいます…</li></ul>
    </section>`;

  let posts = null;
  let shown = [];
  const list = $('#myposts-list');

  const draw = () => {
    if (!alive() || !posts) return;
    const target = shopFilter ? posts.filter((p) => p.shopName === shopFilter) : posts;
    const guiltyTotal = target.reduce((sum, p) => sum + (p.guiltyUids?.length ?? 0), 0);
    const commentTotal = target.reduce((sum, p) => sum + (p.commentCount ?? 0), 0);
    $('#mp-stats').innerHTML = shopFilter
      ? `
        <div><dt>回数</dt><dd>${target.length}<small>回</small></dd></div>
        <div><dt>最高</dt><dd>${target.length ? Math.max(...target.map((p) => p.score)) : '–'}<small>点</small></dd></div>
        <div><dt>平均</dt><dd>${target.length ? Math.round(target.reduce((sum, p) => sum + p.score, 0) / target.length) : '–'}<small>点</small></dd></div>`
      : `
        <div><dt>共有</dt><dd>${target.length}<small>杯</small></dd></div>
        <div><dt>ギルティ</dt><dd>${guiltyTotal}<small>回</small></dd></div>
        <div><dt>コメント</dt><dd>${commentTotal}<small>件</small></dd></div>`;

    $('#mp-sort').innerHTML = target.length > 1 ? `
      <div class="sort-chips" role="tablist" aria-label="並び順">
        ${Object.entries(MYPOSTS_SORTS).map(([key, { label }]) => `
          <button type="button" class="sort-chip${key === myPostsSort ? ' is-on' : ''}" data-sort="${key}" role="tab" aria-selected="${key === myPostsSort}">${label}</button>`).join('')}
      </div>` : '';

    shown = [...target].sort(MYPOSTS_SORTS[myPostsSort].fn);
    list.innerHTML = shown.length
      ? shown.map((p) => postCard(p)).join('')
      : isMe
        ? '<li class="empty">まだ共有した記録がありません。記録の画面で「みんなに共有」を選ぶと、ここに並びます。</li>'
        : '<li class="empty">まだ共有した記録がありません。</li>';
    restorePop(list);
  };

  wirePostList(list, () => shown);

  // 並び順の切り替え。中身を入れ直しても効くよう、親側でまとめて受け取る
  $('#mp-sort').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort]');
    if (!btn || btn.dataset.sort === myPostsSort) return;
    myPostsSort = btn.dataset.sort;
    draw();
  });

  // 名前が分かったら見出しを直す（みんなの記録を通らずに来たときなど）
  if (!isMe && !profileCache.get(uid)?.nickname) {
    ensureProfiles([uid]).then(() => {
      if (!alive()) return;
      const t = app.querySelector('.bar-title');
      if (t) t.textContent = titleOf(nameFor(uid, null));
    });
  }

  try {
    // 端末に残っているぶんがあれば、通信を待たずに先に出す
    const fresh = await cloud.getPostsByUser(uid, (cached) => {
      posts = cached;
      draw();
    });
    if (!alive()) return;
    posts = fresh;
    draw();
    // サーバーの投稿と、端末の「共有済み」の印を突き合わせて直す
    if (isMe) reconcileSharedLinks(fresh).catch((err) => console.error(err));
  } catch (err) {
    console.error(err);
    if (!alive() || posts) return; // すでにキャッシュぶんを出せていれば、そのままにする
    list.innerHTML = `<li class="empty">${esc(shareErrorMessage(err))}</li>`;
    return;
  }

  // 投稿に書かれた名前やアイコンは投稿した時点のもの。最新が読めたら描き直す
  if (await ensureProfiles(posts.flatMap((p) => [p.uid, p.lastComment?.uid, ...(p.withUids ?? [])]))) draw();
}

/* ===================== ユーザーを探す（#/search） ===================== */

// 虫めがねのマーク
function searchIcon() {
  return `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M12.7 12.7 17 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  </svg>`;
}

// 名前を比べやすい形にそろえる。
// 全角・半角、大文字・小文字、カタカナ・ひらがなの違いを無視して探せるようにする
function searchKey(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

let searchWord = ''; // 検索した言葉は、プロフィールを見て戻ってきたときのために覚えておく

async function renderSearch() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const title = 'ユーザーを探す';
  if (!me.ready) {
    app.innerHTML = header(title, { back: '#/feed', backLabel: 'みんなの記録' }) + '<p class="empty">確認しています…</p>';
    return; // ログインの確認が終わったら描き直される
  }
  if (!me.user) {
    goReplace('#/feed');
    return;
  }

  app.innerHTML = header(title, { back: '#/feed', backLabel: 'みんなの記録' }) + `
    <section class="search">
      <label class="search-box">
        ${searchIcon()}
        <input id="search-input" type="search" placeholder="名前で探す" autocomplete="off" enterkeyhint="search" value="${esc(searchWord)}">
      </label>
      <p class="hint" id="search-count"></p>
      <ul class="follow-list" id="search-list"><li class="empty">読み込んでいます…</li></ul>
    </section>`;

  const input = $('#search-input');
  const list = $('#search-list');
  const countEl = $('#search-count');
  let members = null;

  function draw() {
    if (!alive() || !members) return;
    const key = searchKey(searchWord);
    const others = members.filter((m) => m.uid !== me.user.uid);
    const hits = others
      .filter((m) => !key || searchKey(m.nickname).includes(key))
      // フォローしていない人を先に、その中は名前順
      .sort((a, b) => Number(isFollowing(a.uid)) - Number(isFollowing(b.uid))
        || String(a.nickname ?? '').localeCompare(String(b.nickname ?? ''), 'ja'));

    countEl.textContent = key ? `${hits.length}人見つかりました` : `全員（${others.length}人）`;
    list.innerHTML = hits.length
      ? hits.map((m) => `
        <li>
          <a href="#/user/${m.uid}">
            <span class="follow-avatar"><img src="${avatarOf(m.avatar)}" alt=""></span>
            <span class="follow-lines">
              <span class="follow-name">${esc(m.nickname ?? '名無し')}</span>
              ${(m.bio ?? '').trim() ? `<span class="follow-bio">${esc(m.bio.trim())}</span>` : ''}
            </span>
            ${isFollowing(m.uid) ? '<span class="search-tag">フォロー中</span>' : ''}
          </a>
        </li>`).join('')
      : '<li class="empty">見つかりませんでした。</li>';
  }

  input.addEventListener('input', () => {
    searchWord = input.value;
    draw();
  });
  // キーボードの「検索」を押したら、キーボードをしまう
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });

  try {
    members = await cloud.getMembers((cached) => { members = cached; draw(); });
    members.forEach((m) => { if (!profileCache.has(m.uid)) profileCache.set(m.uid, m); });
    draw();
  } catch (err) {
    console.error(err);
    if (!alive() || members) return;
    list.innerHTML = `<li class="empty">${esc(shareErrorMessage(err))}</li>`;
  }
}

async function renderFollows({ id, query }) {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  if (!me.ready) {
    app.innerHTML = header('プロフィール', { back: '#/feed', backLabel: 'みんなの記録' }) + '<p class="empty">確認しています…</p>';
    return; // ログインの確認が終わったら描き直される（フォローの通知から開いたときなど）
  }
  if (!me.user) {
    goReplace('#/feed');
    return;
  }

  const type = query.get('type') === 'followers' ? 'followers' : 'following';
  const title = type === 'followers' ? 'フォロワー' : 'フォロー中';
  const backTo = { back: `#/user/${id}`, backLabel: 'プロフィール' };

  app.innerHTML = header(title, backTo) + '<p class="empty">読み込んでいます…</p>';

  let members = [];
  let profile = null;
  try {
    [members, profile] = await Promise.all([cloud.getMembers(), cloud.getProfile(id)]);
  } catch (err) {
    console.error(err);
    if (!alive()) return;
    app.innerHTML = header(title, backTo) + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  // 自分のフォローは、今この場で押した結果をすぐ反映したいので me.profile を優先する
  const theirFollows = (id === me.user.uid ? me.profile?.follows : profile?.follows) ?? [];
  const list = type === 'followers'
    ? members.filter((m) => (m.follows ?? []).includes(id))
    : members.filter((m) => theirFollows.includes(m.uid));

  if (!alive()) return;
  app.innerHTML = header(title, backTo) + (list.length ? `
    <ul class="follow-list">
      ${list.map((m) => `
        <li>
          <a href="#/user/${m.uid}">
            <span class="follow-avatar"><img src="${avatarOf(m.avatar)}" alt=""></span>
            <span class="follow-lines">
              <span class="follow-name">${esc(m.nickname ?? '名無し')}</span>
              ${(m.bio ?? '').trim() ? `<span class="follow-bio">${esc(m.bio.trim())}</span>` : ''}
            </span>
          </a>
        </li>`).join('')}
    </ul>`
    : `<p class="empty">${type === 'followers' ? 'まだフォロワーはいません。' : 'まだ誰もフォローしていません。'}</p>`);
}

async function renderUser({ id }) {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  if (!me.ready) {
    app.innerHTML = header('プロフィール', { back: '#/feed', backLabel: 'みんなの記録' }) + '<p class="empty">確認しています…</p>';
    return; // ログインの確認が終わったら描き直される（フォローの通知から開いたときなど）
  }
  if (!me.user) {
    goReplace('#/feed');
    return;
  }

  const isMe = id === me.user.uid;
  // 自分のプロフィールはホームから開くので、戻り先もホームにする
  const backTo = isMe ? { back: '#/', backLabel: 'ホーム' } : { back: '#/feed', backLabel: 'みんなの記録' };

  // 先に枠を出して、読めたものから順に埋めていく。
  // その人の投稿は写真ごと運んでくるので重く、全部そろうのを待つと名前すら出ないため。
  // 名前とアイコンは、みんなの記録で読んだぶん（profileCache）があればすぐ出せる。
  let profile = profileCache.get(id) ?? null;
  let posts = null;
  let tagged = null;
  let members = null;

  app.innerHTML = header('プロフィール', backTo) + `
    <section class="user">
      <div class="user-head">
        <span class="user-avatar" id="u-avatar"><img src="${avatarOf(profile?.avatar)}" alt=""></span>
        <div class="user-lines">
          <h2 class="user-name" id="u-name">${esc(profile?.nickname ?? '')}</h2>
          <div id="u-bio"></div>
          <div class="follow-stats" id="u-follows"></div>
        </div>
      </div>
      <div id="u-actions"></div>
      <dl class="shop-stats" id="u-stats"></dl>
      <div id="u-body"><p class="empty">読み込んでいます…</p></div>
    </section>`;

  // --- 描き込みの部品。読めたものが増えるたびに呼ぶ ---

  function drawHead() {
    if (!alive()) return;
    const bio = (profile?.bio ?? '').trim();
    // バッジは共有した杯数で決まるので、投稿が読めてから付ける。
    // 本人が選んだ段階は、今解放されている段階までに収める
    let badge = '';
    if (posts) {
      const eligibleTier = badgeTierForCount(posts.length);
      badge = badgeImg(Math.min(profile?.badgeChoice ?? eligibleTier, eligibleTier));
    }
    $('#u-avatar').innerHTML = `<img src="${avatarOf(profile?.avatar)}" alt="">`;
    $('#u-name').innerHTML = esc(profile?.nickname ?? '名無し') + badge;
    $('#u-bio').innerHTML = bio ? `<p class="user-bio">${esc(bio)}</p>` : '';
  }

  // フォロー数はその人のプロフィールだけで分かる。
  // フォロワー数は身内全員を読まないと数えられないので、読めるまでは「–」にしておく
  function drawFollowStats() {
    if (!alive()) return;
    // 自分のプロフィールを見ているときは、今この場で押した結果をすぐ反映したいので me.profile を優先する
    const theirFollows = (isMe ? me.profile?.follows : profile?.follows) ?? [];
    const followerCount = members
      ? members.filter((m) => (m.follows ?? []).includes(id)).length
      : '–';
    $('#u-follows').innerHTML = `
      <a href="#/follows/${id}?type=following"><strong>${theirFollows.length}</strong>フォロー中</a>
      <a href="#/follows/${id}?type=followers"><strong>${followerCount}</strong>フォロワー</a>`;
  }

  function drawActions() {
    if (!alive()) return;
    $('#u-actions').innerHTML = isMe
      ? `<div class="user-me-actions">
           <a class="btn btn-ghost" href="#/myposts">自分の投稿</a>
           <a class="btn btn-ghost" href="#/account">プロフィールを編集</a>
         </div>`
      : `<div class="user-actions">
           <button type="button" class="follow-btn${isFollowing(id) ? ' is-on' : ''}" id="follow-btn">
             ${isFollowing(id) ? 'フォロー中' : 'フォローする'}
           </button>
           <button type="button" class="bell-btn${isMuted(id) ? ' is-muted' : ''}" id="mute-btn"
             aria-pressed="${isMuted(id)}"
             aria-label="${isMuted(id) ? 'この人のお知らせを受け取る' : 'この人のお知らせを切る'}">
             ${bellIcon(isMuted(id))}
           </button>
         </div>`;

    // フォローする・やめるを切り替える
    const followBtn = $('#follow-btn');
    if (followBtn) {
      followBtn.onclick = async () => {
        followBtn.disabled = true;
        const next = isFollowing(id)
          ? followUids().filter((u) => u !== id)
          : [...followUids(), id];
        try {
          await cloud.saveProfile(me.user.uid, { follows: next });
          me.profile = { ...me.profile, follows: next };
          profileCache.set(me.user.uid, me.profile);
          toast(next.includes(id) ? 'フォローしました' : 'フォローをやめました');
          if (!alive()) return;
          // 自分の押した結果と、相手のフォロワー数を出し直す
          if (members) {
            members = members.map((m) => (m.uid === me.user.uid ? { ...m, follows: next } : m));
          }
          drawActions();
          drawFollowStats();
        } catch (err) {
          console.error(err);
          toast(shareErrorMessage(err));
          followBtn.disabled = false;
        }
      };
    }

    // この人のお知らせを受け取るかどうかを切り替える
    const muteBtn = $('#mute-btn');
    if (muteBtn) {
      muteBtn.onclick = async () => {
        muteBtn.disabled = true;
        const next = isMuted(id)
          ? mutedUids().filter((u) => u !== id)
          : [...mutedUids(), id];
        try {
          await cloud.saveProfile(me.user.uid, { mutedUids: next });
          me.profile = { ...me.profile, mutedUids: next };
          profileCache.set(me.user.uid, me.profile);
          toast(next.includes(id) ? 'お知らせを切りました' : 'お知らせを受け取ります');
          if (!alive()) return;
          drawActions();
        } catch (err) {
          console.error(err);
          toast(shareErrorMessage(err));
          muteBtn.disabled = false;
        }
      };
    }
  }

  // その人の投稿が読めたら、杯数・図鑑・カレンダーを出す
  function drawPosts() {
    if (!alive() || !posts || !readyForPosts()) return;
    const shopNames = new Set(posts.map((p) => p.shopName));
    $('#u-stats').innerHTML = `
      <div><dt>共有</dt><dd>${posts.length}<small>杯</small></dd></div>
      <div><dt>お店</dt><dd>${shopNames.size}<small>店</small></dd></div>
      <div><dt>最高</dt><dd>${posts.length ? Math.max(...posts.map((p) => p.score)) : '–'}<small>点</small></dd></div>`;

    // 公開設定。決めていない人は「見せる」扱いにする
    const showZukan = profile?.showZukan !== false;
    const showCalendar = profile?.showCalendar !== false;
    $('#u-body').innerHTML = `
      ${!isMe && posts.length ? `
        <a class="user-posts-link" href="#/posts/${id}">
          <span>共有した記録を一覧で見る</span>
          <small>${posts.length}杯・並び替えできます ›</small>
        </a>` : ''}
      ${showZukan ? '<h2 class="section-title">図鑑</h2><div id="user-zukan"></div>' : ''}
      ${showCalendar ? '<h2 class="section-title">カレンダー</h2><div id="user-cal"></div>' : ''}
      ${!showZukan && !showCalendar
        ? '<p class="empty">このユーザーは図鑑とカレンダーを公開していません。</p>'
        : ''}
      <div id="u-tagged"></div>`;
    if (showZukan) renderUserZukan($('#user-zukan'), posts, id);
    if (showCalendar) renderUserCalendar($('#user-cal'), posts);
    drawHead();   // バッジを付け直す
    drawTagged(); // 入れ物を作り直したので、読めていれば書き戻す
  }

  // 一緒に食べた記録。書いたのは別の人なので、名前とアイコンは読めしだい直す
  function drawTagged() {
    if (!alive() || !tagged?.length) return;
    const wrap = $('#u-tagged');
    if (!wrap) return; // 投稿がまだ読めていないときは、drawPosts のあとで描かれる
    wrap.innerHTML = '<h2 class="section-title">一緒に食べた記録</h2><ul class="post-list" id="user-tagged"></ul>';
    const list = $('#user-tagged');
    list.innerHTML = tagged.map((p) => postCard(p, { withLastComment: false })).join('');
    wirePostList(list, () => tagged);
  }

  drawActions();
  drawHead();
  drawFollowStats();

  // 読み込みは4つとも同時に始める。待ち合わせはせず、返ってきたものから描いていく。
  // 図鑑とカレンダーは公開設定（プロフィール側にある）を見てから出すので、
  // 投稿が先に届いた場合は profileDone が立つのを待って描く。
  let profileDone = false;

  cloud.getProfile(id, (cached) => {
    profile = cached;
    profileCache.set(id, cached);
    drawHead();
    drawFollowStats();
  })
    .then((fresh) => {
      if (fresh) {
        profile = fresh;
        profileCache.set(id, fresh);
      }
    })
    .catch((err) => console.error(err))
    .finally(() => {
      profileDone = true;
      if (!alive()) return;
      drawHead();
      drawFollowStats();
      drawPosts(); // 投稿が先に届いていた場合は、ここで出す
    });

  cloud.getPostsByUser(id, (cached) => { posts = cached; drawPosts(); })
    .then((list) => { posts = list; drawPosts(); })
    .catch((err) => {
      console.error(err);
      if (alive() && !posts) $('#u-body').innerHTML = `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    });

  cloud.getPostsTaggedWith(id, (cached) => { tagged = cached; drawTagged(); })
    .then(async (list) => {
      tagged = list;
      drawTagged();
      // 投稿に書かれた名前やアイコンは投稿した時点のもの。最新が読めたら描き直す
      if (await ensureProfiles(list.flatMap((p) => [p.uid, ...(p.withUids ?? [])]))) drawTagged();
    })
    .catch((err) => console.error(err));

  // フォロワー数を数えるためだけに身内全員を読むので、これがいちばん重い
  cloud.getMembers((cached) => { members = cached; drawFollowStats(); })
    .then((list) => { members = list; drawFollowStats(); })
    .catch((err) => console.error(err));

  // 投稿が届いても、公開設定がまだ読めていないうちは描かない
  function readyForPosts() {
    return profileDone || profile != null;
  }
}

// 共有された記録をお店ごとにまとめて図鑑にする。
// カードをタップすると、その店の投稿へ（1回だけならその投稿、何回もあれば一覧）
function renderUserZukan(slot, posts, uid) {
  if (!posts.length) {
    slot.innerHTML = '<p class="empty">共有された記録がありません。</p>';
    return;
  }
  const byShop = new Map();
  // 古い順に見て、最初の1件を「初めて食べた時」として扱う
  const oldest = [...posts].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  for (const p of oldest) {
    if (!byShop.has(p.shopName)) byShop.set(p.shopName, { first: p, count: 0, best: 0 });
    const v = byShop.get(p.shopName);
    v.count += 1;
    v.best = Math.max(v.best, p.score);
  }

  slot.innerHTML = `<ul class="zukan">${[...byShop.entries()].map(([shopNameText, v], i) => {
    const comment = (v.first.comment ?? '').trim();
    const href = v.count === 1
      ? `#/post/${v.first.id}`
      : `#/posts/${uid}?shop=${encodeURIComponent(shopNameText)}`;
    return `
      <li>
        <a class="zk-card is-link" href="${href}">
          <div class="zk-photo">
            ${v.first.photo ? `<img src="${v.first.photo}" alt="" loading="lazy">` : noImage}
            <span class="zk-stamp">${v.count}<small>回</small></span>
          </div>
          <div class="zk-body">
            <span class="zk-no">No.${String(i + 1).padStart(3, '0')}</span>
            <h3 class="zk-name">${esc(shopNameText)}</h3>
            <p class="zk-best${v.best >= GUILTY ? ' is-guilty' : ''}">最高 <b>${v.best}</b>点</p>
            <p class="zk-comment${comment ? '' : ' is-empty'}">${comment ? esc(comment) : 'コメントがありません'}</p>
          </div>
        </a>
      </li>`;
  }).join('')}</ul>`;
}

// 共有された記録からカレンダーを作る（月の移動は矢印のみ）
function renderUserCalendar(slot, posts) {
  if (!posts.length) {
    slot.innerHTML = '<p class="empty">共有された記録がありません。</p>';
    return;
  }
  const today = todayStr();
  const byDate = new Map();
  for (const p of [...posts].reverse()) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  const start = new Date();
  let y = start.getFullYear();
  let m = start.getMonth();

  function draw() {
    const prefix = `${y}-${pad2(m + 1)}`;
    const count = posts.filter((p) => p.date.startsWith(prefix)).length;
    slot.innerHTML = `
      <div class="cal-nav">
        <button type="button" class="cal-arrow" data-uc="-1" aria-label="前の月">‹</button>
        <h3 class="cal-month">${y}年${m + 1}月<small>${count}杯</small></h3>
        <button type="button" class="cal-arrow" data-uc="1" aria-label="次の月">›</button>
      </div>
      <div class="cal-week" aria-hidden="true">
        ${[...'日月火水木金土'].map((w, i) => `<span class="dow-${i}">${w}</span>`).join('')}
      </div>
      ${monthCells(y, m, byDate, (p) => p.shopName, today, null)}`;

    slot.querySelectorAll('[data-uc]').forEach((btn) => {
      btn.onclick = () => {
        const d = new Date(y, m + Number(btn.dataset.uc), 1);
        y = d.getFullYear();
        m = d.getMonth();
        draw();
      };
    });
  }
  draw();
}

/* ===================== 設定（バックアップ・通知・アプリの更新など） ===================== */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 全データ（写真込み）を1つのJSONファイルにまとめる
async function createBackupFile() {
  const [shops, records, photos] = await Promise.all([
    db.getAll('shops'), db.getAll('records'), db.getAll('photos'),
  ]);
  const photoData = [];
  for (const p of photos) {
    photoData.push({ id: p.id, data: await blobToDataUrl(p.blob) });
  }
  const json = JSON.stringify({
    app: 'ramen-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    shops,
    records,
    photos: photoData,
  });
  const stamp = todayStr().replaceAll('-', '');
  return new File([json], `ramen-backup-${stamp}.json`, { type: 'application/json' });
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- お知らせ（更新内容の掲示板） ----------
   新しい版を出すときは、この配列のいちばん上に1件足す。
   version は sw.js の CACHE_NAME と app.js の APP_VERSION に合わせる。
   未読の数は、いちばん上の version を読んだかどうかで数えている。 */
//   version … 'ramen-log-v46' の形（画面には 'v46' と出る）
//   title   … 一覧に出す一言のタイトル
//   lead    … 詳細画面のいちばん上に出す説明（なくてもよい）
//   items   … 変更点。「見出し：説明」と書くと、見出しが太字になる
const CHANGELOG = [
  {
    version: 'ramen-log-v47',
    date: '2026-10-08',
    title: '返信の改善と、ほかの人の記録一覧',
    lead: 'コメントの返信まわりを直し、ほかの人の共有した記録を見やすくしました。',
    items: [
      '返信：返信を送ったのに「うまくいきませんでした」と出ていたのを直しました。送ったあとは入力欄も空に戻ります',
      '返信の入力欄：返信先のコメントのすぐ下に開くようになりました。送った返信が並ぶ場所と同じです',
      '返信の返信：返信にも返信できるようになりました。誰あてかは「@名前」で分かります。相手には通知も届きます',
      '共有した記録の一覧：ほかの人のプロフィールから、その人が共有した記録を一覧で見られます。新しい順・古い順・点数順・ギルティ順・コメント順で並び替えできます',
      '図鑑：ほかの人の図鑑に最高点が出るようになり、タップするとその店の投稿を見られます',
      '写真の向き：写真を選んだとき、2本指でひねると自由な角度に回せるようになりました。拡大と同時にできます。90度ずつ回すボタンと、まっすぐに戻すボタンもあります',
      'ギルチキの一言：食べた一杯や連続記録の話は、その日のうちだけになりました。記録がない日は別の話をします',
    ],
  },
  {
    version: 'ramen-log-v46',
    date: '2026-10-02',
    title: 'ユーザー検索とポイント履歴を追加',
    lead: '使い勝手の調整をまとめて行いました。',
    items: [
      'ユーザーを探す：みんなの記録のいちばん上から、名前で人を探せるようになりました',
      'ポイント履歴：ガチャ画面の「ポイント履歴」から、もらった・使ったポイントを見られます（この版からの記録です）',
      '記録できたお知らせ：記録してホームに戻ったとき、画面の上に「記録した！」と出ます。共有できたかどうかも一緒に出ます',
      'お知らせの見た目：版ごとにタイトルを付けて並べ、タップすると詳しい内容を見られるようにしました',
      '返信の通知：自分のコメントに返信が付いたときも通知が届くようになりました',
      '一緒に食べた人：選べるのがフォローしている人だけになりました',
      '説明文：みんなの記録で説明文が途中で切れていたのを直しました。長いときは記録を開くと全文を読めます',
      '写真：みんなの記録で開いた写真を、下にスワイプして閉じられるようになりました',
    ],
  },
];


async function newsReadVersion() {
  const rec = await db.get('chiki', 'newsRead');
  return rec?.version ?? null;
}

// 未読の件数。まだ一度も開いていないときは、古い記録を全部未読にしても
// 驚かせるだけなので、いちばん新しい1件だけを未読として数える
async function newsUnreadCount() {
  if (!CHANGELOG.length) return 0; // お知らせが1件もないときは数えない
  const read = await newsReadVersion();
  if (!read) return 1;
  const index = CHANGELOG.findIndex((entry) => entry.version === read);
  return index === -1 ? CHANGELOG.length : index;
}

async function markNewsRead() {
  await db.put('chiki', { id: 'newsRead', version: CHANGELOG[0]?.version ?? APP_VERSION });
}



// sw.js の CACHE_NAME と同じ値にしておく。ここが今この端末で動いている版。
// 新しい版を出すときは、sw.js と合わせてこちらの数字も上げる。
const APP_VERSION = 'ramen-log-v47';

// GitHubに置いてある sw.js を直接読んで、向こうの版を調べる。
// キャッシュを通すと今使っている版が返ってきてしまうので no-store を付ける。
async function latestVersion() {
  const res = await fetch(`./sw.js?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('sw.js を読めませんでした');
  const text = await res.text();
  return text.match(/CACHE_NAME\s*=\s*'([^']+)'/)?.[1] ?? null;
}

// 新しい Service Worker に入れ替えてから開き直す。
// sw.js は install のときに skipWaiting() を呼ぶので、
// 取ってこられさえすればそのまま新しいほうが使われる。
async function applyUpdate() {
  // 先に、ためてある古いファイルを消す。
  // これをしないと Service Worker が「まずキャッシュを返す」ので、
  // 開き直したあとも1回ぶん古いままになることがある（押したのに変わらない、の原因）。
  // Firebaseの部品は中身が変わらないので残しておく（消すと次のログインで読み直しになる）
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.includes('firebase')).map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.error(err);
  }

  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) {
    try {
      await reg.update();
    } catch (err) {
      console.error(err);
    }
    const worker = reg.installing ?? reg.waiting;
    if (worker) {
      // 入れ替わるまで少し待つ。待ちすぎないよう5秒で切り上げる
      await new Promise((resolve) => {
        const check = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') resolve();
        };
        worker.addEventListener('statechange', check);
        check();
        setTimeout(resolve, 5000);
      });
    }
  }
  location.reload();
}

// ── 起動したときの版の確認 ──────────────────────────────
// 古い版のままだと、どの機能がどこまで直っているのか分からなくなるので、
// 更新があるときは画面をふさいで、押して更新してもらう（ソーシャルゲームと同じ考え方）。
// 以前は消せるお知らせの帯を出すだけで、裏では勝手に新しくなっていたため、
// 更新されたのかどうかが使っていて分からなかった。
const UPDATE_TRY_KEY = 'ramen-log:update-try'; // 何回押しても変わらないときの逃げ道用
let gateOpen = false;
let lastVersionCheck = 0;
let gateSkipUntil = 0;

function shortVersion(version) {
  return String(version).replace('ramen-log-', '');
}

// 同じ版に対して「アップデート」を押した回数
function updateTries(version) {
  try {
    const saved = JSON.parse(localStorage.getItem(UPDATE_TRY_KEY) ?? 'null');
    return saved?.version === version ? (saved.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

function noteUpdateTry(version) {
  try {
    localStorage.setItem(UPDATE_TRY_KEY, JSON.stringify({ version, count: updateTries(version) + 1 }));
  } catch { /* 使えなくても更新自体は進める */ }
}

function clearUpdateTries() {
  try {
    localStorage.removeItem(UPDATE_TRY_KEY);
  } catch { /* 何もしない */ }
}

// 版を調べて、古ければ更新の画面でふさぐ。
// オフラインなどで調べられないときはふさがない（そもそも更新できないため）。
async function checkVersionGate({ force = false } = {}) {
  if (gateOpen) return;
  const now = Date.now();
  if (!force && (now - lastVersionCheck < 5 * 60 * 1000 || now < gateSkipUntil)) return;
  lastVersionCheck = now;

  let newest = null;
  try {
    newest = await latestVersion();
  } catch {
    return;
  }
  if (!newest || newest === APP_VERSION) {
    clearUpdateTries(); // 無事に新しくなったので、数えていた回数は消す
    return;
  }
  if (!force && now < gateSkipUntil) return;
  showUpdateGate(newest);
}

// 更新するまで中を触れないようにする画面
function showUpdateGate(newest) {
  if (gateOpen) return;
  gateOpen = true;
  const stuck = updateTries(newest) >= 2; // 2回押しても変わらなかったとき

  const gate = document.createElement('div');
  gate.className = 'update-gate';
  gate.innerHTML = `
    <div class="update-gate-card">
      <img class="update-gate-chiki" src="./giruchiki.png" alt="" draggable="false">
      <h2 class="update-gate-title">アップデートがあります</h2>
      <p class="update-gate-ver">${esc(shortVersion(APP_VERSION))} <span>→</span> <b>${esc(shortVersion(newest))}</b></p>
      <p class="update-gate-lead">最新版に更新してからご利用ください。<br>記録や写真はそのまま残ります。</p>
      <button type="button" class="update-gate-go" id="update-gate-go">アップデート</button>
      ${stuck ? `
        <p class="update-gate-help">何度か試しても変わらないときは、電波の良い場所でもう一度お試しください。
        それでも変わらないときは、いったんこのまま使えます。</p>
        <button type="button" class="update-gate-skip" id="update-gate-skip">今回はこのまま使う</button>` : ''}
    </div>`;
  document.body.appendChild(gate);
  document.body.classList.add('gate-open'); // 後ろの画面を動かせなくする

  gate.querySelector('#update-gate-go').onclick = async () => {
    const go = gate.querySelector('#update-gate-go');
    go.disabled = true;
    go.textContent = '更新しています…';
    noteUpdateTry(newest);
    await applyUpdate();
  };

  gate.querySelector('#update-gate-skip')?.addEventListener('click', () => {
    clearUpdateTries();
    gate.remove();
    document.body.classList.remove('gate-open');
    gateOpen = false;
    gateSkipUntil = Date.now() + 60 * 60 * 1000; // 1時間は出し直さない
  });
}

async function renderSettings() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  const { shops, records } = await loadAll();

  if (!alive()) return;
  app.innerHTML = header('設定') + `
    <section class="settings">
      <nav class="set-nav" aria-label="設定の項目">
        <button type="button" data-jump="set-account">アカウント</button>
        ${me.user ? '<button type="button" data-jump="set-notif">通知</button>' : ''}
        <button type="button" data-jump="set-data">データ</button>
        <button type="button" data-jump="set-app">アプリ</button>
        <button type="button" data-jump="set-other">その他</button>
      </nav>

      <div class="set-group" id="set-account">
        <h2 class="set-group-title">アカウント・共有</h2>
        <div class="set-card">
          ${me.user ? `
            <p class="set-lead">${esc(myName())}<small>${esc(me.user.email ?? '')}</small></p>
            <div class="set-links">
              <a class="set-link" href="#/user/${me.user.uid}">プロフィール</a>
              <a class="set-link" href="#/myposts">自分の投稿</a>
              <a class="set-link" href="#/account">アカウント</a>
            </div>` : `
            <p>身内で記録を見せ合う機能です。まずログインしてください。</p>
            <a class="btn btn-primary btn-block" href="#/account">ログイン</a>`}
        </div>
      </div>

      ${me.user ? `
      <div class="set-group" id="set-notif">
        <h2 class="set-group-title">通知</h2>
        <div class="set-card">
          <p class="hint" id="notif-state">確認しています…</p>
          <button type="button" class="btn btn-ghost btn-block" id="notif-enable" hidden>通知を有効にする</button>
          <div id="notif-toggles" hidden>
            <p class="set-sub">受け取る通知</p>
            <label class="check-row"><input type="checkbox" id="notif-post"> 身内が新しく共有したとき</label>
            <label class="check-row"><input type="checkbox" id="notif-guilty"> 自分の投稿にギルティが付いたとき</label>
            <label class="check-row"><input type="checkbox" id="notif-comment"> 自分の投稿へのコメント・自分のコメントへの返信</label>
            <label class="check-row"><input type="checkbox" id="notif-follow"> 誰かにフォローされたとき</label>
          </div>
        </div>
      </div>` : ''}

      <div class="set-group" id="set-data">
        <h2 class="set-group-title">データ</h2>
        <div class="set-card">
          <h3 class="set-sub">保存状況</h3>
          <p class="set-stat">お店 <strong>${shops.length}</strong>店　記録 <strong>${records.length}</strong>件<span id="usage"></span></p>
        </div>
        <div class="set-card">
          <h3 class="set-sub">バックアップ</h3>
          <p class="hint">記録はこの端末の中にだけ保存されています。機種変更やアプリの削除に備えて、ときどき書き出しておきましょう。</p>
          <button type="button" class="btn btn-primary btn-block" id="export">バックアップを作成</button>
          <div id="export-ready" hidden>
            <p class="hint" id="export-info"></p>
            <button type="button" class="btn btn-primary btn-block" id="export-save">ファイルとして保存</button>
          </div>
          <label class="btn btn-ghost btn-block">
            バックアップから復元
            <input type="file" id="import" accept=".json,application/json" class="visually-hidden">
          </label>
          <p class="hint">復元すると、今の記録はすべてバックアップの内容に置き換わります。</p>
        </div>
        <div class="set-card">
          <h3 class="set-sub">共有した記録から復元</h3>
          <p class="hint">ホーム画面のアイコンを消して入れ直すと、端末の中の記録は消えてしまいます。みんなに共有した分だけは、ここから端末に戻せます。</p>
          <button type="button" class="btn btn-ghost btn-block" id="restore-shared">共有した記録を端末に戻す</button>
        </div>
      </div>

      <div class="set-group" id="set-app">
        <h2 class="set-group-title">アプリ</h2>
        <div class="set-card">
          <h3 class="set-sub">アプリの更新</h3>
          <p class="hint" id="update-state">今の版：${APP_VERSION}</p>
          <button type="button" class="btn btn-ghost btn-block" id="update-btn">最新版があるか確認</button>
          <div class="set-links">
            <a class="set-link" href="#/news">お知らせ（更新内容）</a>
          </div>
        </div>
      </div>

      <div class="set-group" id="set-other">
        <h2 class="set-group-title">その他</h2>
        <div class="set-card">
          <div class="field">
            <label for="redeem-code">コードを入力</label>
            <div class="redeem-row">
              <input id="redeem-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="コードを入力">
              <button type="button" class="btn btn-ghost" id="redeem-btn">使う</button>
            </div>
            <p class="form-error" id="redeem-error" role="alert"></p>
          </div>
        </div>
      </div>
    </section>`;

  // 上の項目名を押したら、その場所まで滑らかに送る（URLの#は画面の切り替えに使っているので変えない）
  app.querySelector('.set-nav').addEventListener('click', (event) => {
    const link = event.target.closest('[data-jump]');
    if (!link) return;
    const target = document.getElementById(link.dataset.jump);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: 'smooth' });
  });

  navigator.storage?.estimate?.()
    .then(({ usage }) => {
      if (usage != null) $('#usage').textContent = `　使用容量 約${(usage / 1024 / 1024).toFixed(1)}MB`;
    })
    .catch(() => {});

  // --- 通知 ---
  if (me.user) {
    const notifState = $('#notif-state');
    const notifEnable = $('#notif-enable');
    const notifToggles = $('#notif-toggles');

    const supported = await notificationsAvailable();
    const savedToken = localStorage.getItem(FCM_TOKEN_KEY);

    if (!supported) {
      notifState.textContent = VAPID_KEY === '__VAPID_KEY__'
        ? '準備中です（設定がまだ完了していません）'
        : 'この端末・この開き方では通知に対応していません。ホーム画面に追加したアイコンから開いてください。';
    } else if (savedToken) {
      notifState.textContent = '有効です';
      notifToggles.hidden = false;
    } else if (Notification.permission === 'denied') {
      notifState.textContent = 'ブロックされています。iPhoneの「設定」アプリ→このアプリの通知から許可してください。';
    } else {
      notifState.textContent = 'まだ有効にしていません';
      notifEnable.hidden = false;
    }

    notifEnable.onclick = async () => {
      notifEnable.disabled = true;
      try {
        const result = await enableNotificationsNow();
        if (result === 'denied') {
          notifState.textContent = '許可されませんでした';
          notifEnable.disabled = false;
          return;
        }
        notifState.textContent = '有効です';
        notifEnable.hidden = true;
        notifToggles.hidden = false;
      } catch (err) {
        console.error(err);
        toast('通知を設定できませんでした');
        notifEnable.disabled = false;
      }
    };

    // どの通知を受け取るか。設定していない人は「受け取る」扱いにする
    [
      ['notif-post', 'notifyOnPost'],
      ['notif-guilty', 'notifyOnGuilty'],
      ['notif-comment', 'notifyOnComment'],
      ['notif-follow', 'notifyOnFollow'],
    ].forEach(([elId, field]) => {
      const checkbox = $(`#${elId}`);
      checkbox.checked = me.profile?.[field] !== false;
      checkbox.onchange = async () => {
        const value = checkbox.checked;
        checkbox.disabled = true;
        try {
          await cloud.saveProfile(me.user.uid, { [field]: value });
          me.profile = { ...me.profile, [field]: value };
          profileCache.set(me.user.uid, me.profile);
        } catch (err) {
          console.error(err);
          checkbox.checked = !value;
          toast('保存できませんでした');
        }
        checkbox.disabled = false;
      };
    });
  }

  // --- アプリの更新 ---
  // ボタンは最新版でも消さない。押せば今の状態がその場で分かるようにしてある。
  const updateBtn = $('#update-btn');
  const updateState = $('#update-state');

  updateBtn.onclick = async () => {
    updateBtn.disabled = true;
    updateState.textContent = '確認しています…';
    let newest = null;
    try {
      newest = await latestVersion();
    } catch (err) {
      console.error(err);
      updateState.textContent = '確認できませんでした。電波の良い場所でもう一度お試しください。';
      updateBtn.disabled = false;
      return;
    }

    if (!newest || newest === APP_VERSION) {
      updateState.textContent = `最新版です（${APP_VERSION}）`;
      updateBtn.disabled = false;
      return;
    }

    updateState.textContent = `新しい版があります（${APP_VERSION} → ${newest}）`;
    updateBtn.disabled = false;
    showUpdateGate(newest); // 更新の画面を出す（そこから更新する）
  };

  // 開いたときに一度だけ静かに調べておく。
  // 失敗しても何も出さない（オフラインのときに驚かせないため）
  latestVersion()
    .then((newest) => {
      if (!document.body.contains(updateState)) return;
      if (newest && newest !== APP_VERSION) {
        updateState.textContent = `新しい版があります（${APP_VERSION} → ${newest}）`;
        updateBtn.textContent = '最新版に更新する';
        updateBtn.classList.remove('btn-ghost');
        updateBtn.classList.add('btn-primary');
      }
    })
    .catch(() => {});

  // 共有した記録を、端末の記録として作り直す
  $('#restore-shared').onclick = async () => {
    const btn = $('#restore-shared');
    if (!me.user) {
      toast('先にログインしてください');
      return;
    }
    btn.disabled = true;
    try {
      const mine = await cloud.getPostsByUser(me.user.uid);
      if (!mine.length) {
        toast('共有した記録がありません');
        btn.disabled = false;
        return;
      }
      const { shops, records } = await loadAll();
      // すでに端末にある分（同じ投稿から戻したもの）は作らない
      const known = new Set(records.map((r) => r.postId).filter(Boolean));
      const target = mine.filter((p) => !known.has(p.id));
      if (!target.length) {
        toast('戻せる記録はありません');
        btn.disabled = false;
        return;
      }
      if (!confirm(`${target.length}件を端末の記録として戻します。よろしいですか？`)) {
        btn.disabled = false;
        return;
      }

      // 店名でまとめる。同じ名前のお店がすでにあればそれを使う
      const shopByName = new Map(shops.map((sh) => [sh.name, sh]));
      // 古い順に戻すと、図鑑の「初めて食べた時」が正しくなる
      for (const post of [...target].reverse()) {
        let shop = shopByName.get(post.shopName);
        if (!shop) {
          shop = { id: newId(), name: post.shopName, address: post.shopAddress ?? '', createdAt: Date.now() };
          shopByName.set(post.shopName, shop);
        }
        let photoId = null;
        let newPhoto = null;
        if (post.photo) {
          photoId = newId();
          newPhoto = { id: photoId, blob: await (await fetch(post.photo)).blob() };
        }
        const record = {
          id: newId(),
          shopId: shop.id,
          menu: post.menu,
          date: post.date,
          score: post.score,
          comment: post.comment ?? '',
          photoId,
          postId: post.id,  // もう共有済みなので、そのまま結び付けておく
          createdAt: (post.createdAt?.seconds ?? 0) * 1000 || Date.now(),
          updatedAt: Date.now(),
        };
        await db.saveRecord({ shop, record, newPhoto, oldPhotoId: null });
      }
      askPersist();
      toast(`${target.length}件を戻しました`);
      renderSettings();
    } catch (err) {
      console.error(err);
      toast(shareErrorMessage(err));
      btn.disabled = false;
    }
  };

  $('#redeem-btn').onclick = async () => {
    const input = $('#redeem-code');
    const errorEl = $('#redeem-error');
    errorEl.textContent = '';
    await loadChikiState(); // 他の画面で使った直後でも、最新の状態を見てから判定する
    const { amount, reason } = await redeemCode(input.value);
    if (amount != null) {
      input.value = '';
      toast(`コードを使いました。+${amount}pt`);
      return;
    }
    errorEl.textContent = reason === 'used' ? 'このコードはすでに使いました。'
      : reason === 'empty' ? 'コードを入力してください。'
      : 'そのコードは使えません。';
  };

  let backupFile = null;

  // 作成と保存を2段階に分けているのは、iPhoneの共有シートが
  // 「ボタンを押した直後」でないと開けない決まりがあるため
  $('#export').onclick = async () => {
    const btn = $('#export');
    btn.disabled = true;
    btn.textContent = '作成中…';
    try {
      backupFile = await createBackupFile();
      $('#export-info').textContent =
        `${backupFile.name}（${(backupFile.size / 1024 / 1024).toFixed(1)}MB）を作成しました。`;
      $('#export-ready').hidden = false;
      btn.hidden = true;
    } catch (err) {
      console.error(err);
      toast('バックアップを作成できませんでした');
      btn.disabled = false;
      btn.textContent = 'バックアップを作成';
    }
  };

  $('#export-save').onclick = async () => {
    if (!backupFile) return;
    const isTouchDevice = matchMedia('(pointer: coarse)').matches;
    // スマホは共有シート（「ファイルに保存」を選ぶ）、パソコンは通常のダウンロード
    if (isTouchDevice && navigator.canShare?.({ files: [backupFile] })) {
      try {
        await navigator.share({ files: [backupFile] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    downloadFile(backupFile);
  };

  $('#import').onchange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'ramen-log' || !Array.isArray(data.shops) || !Array.isArray(data.records)) {
        throw new Error('バックアップの形式が違います');
      }
      if (!confirm(`お店${data.shops.length}店・記録${data.records.length}件のバックアップで、今の記録を置き換えます。よろしいですか？`)) return;

      const photos = await Promise.all((data.photos ?? []).map(async (p) => ({
        id: p.id,
        blob: await (await fetch(p.data)).blob(),
      })));
      await db.replaceAll({ shops: data.shops, records: data.records, photos });
      [...photoUrls.keys()].forEach(forgetPhotoUrl);
      askPersist();
      toast('バックアップから復元しました');
      goReplace('#/');
    } catch (err) {
      console.error(err);
      alert('このファイルは読み込めませんでした。このアプリで作成したバックアップファイルを選んでください。');
    }
  };
}

/* ===================== みんなに共有 ===================== */

// 編集画面の下に出す共有の欄。ログインしていないときは案内だけ出す。
function shareSection(record) {
  if (!me.user) {
    return `<section class="share-box">
      <h2 class="section-title">みんなに共有</h2>
      <p class="hint">ログインすると、この記録を身内に共有できます。</p>
      <a class="btn btn-ghost btn-block" href="#/account">ログイン</a>
    </section>`;
  }
  const shared = Boolean(record.postId);
  return `<section class="share-box">
    <h2 class="section-title">みんなに共有</h2>
    <p class="hint" id="share-state">${shared ? 'この記録は共有中です。' : 'まだ共有していません。'}</p>
    <button type="button" class="btn ${shared ? 'btn-ghost' : 'btn-primary'} btn-block" id="share-btn">
      ${shared ? '共有をやめる' : 'みんなに共有する'}
    </button>
  </section>`;
}

// 共有用に写真を少し小さくして、文字列に変換する。
// Firestoreは1件1MBまでなので、長辺720pxに落としてから送る。
async function photoForShare(photoId) {
  if (!photoId) return null;
  const photo = await db.get('photos', photoId);
  if (!photo) return null;
  const small = await resizeImage(new File([photo.blob], 'p.jpg', { type: 'image/jpeg' }), 720, 0.8);
  return blobToDataUrl(small);
}

// 共有ボタンの動きをつなぐ。record は編集中の記録。
function setupShare(record, shopNameText, shopAddressText) {
  const btn = $('#share-btn');
  if (!btn) return;

  btn.onclick = async () => {
    btn.disabled = true;
    const wasShared = Boolean(record.postId);
    try {
      if (wasShared) {
        if (!confirm('共有をやめますか？みんなの記録から消えます。')) {
          btn.disabled = false;
          return;
        }
        await cloud.deletePost(record.postId);
        await db.put('records', { ...record, postId: null });
        record.postId = null;
        toast('共有をやめました');
      } else {
        const postId = await cloud.sharePost({
          uid: me.user.uid,
          nickname: myName(),
          avatar: me.profile?.avatar ?? null,
          shopName: shopNameText,
          shopAddress: shopAddressText ?? '',
          menu: record.menu,
          date: record.date,
          score: record.score,
          comment: record.comment ?? '',
          withUids: record.withUids ?? [],
          photo: await photoForShare(record.photoId),
        });
        await db.put('records', { ...record, postId });
        record.postId = postId;
        showDoneBanner({
          title: 'みんなに共有した！',
          sub: `${shopNameText}・${record.score}点`,
        });
        await maybeCelebrateBadge(); // 区切りに届いていたらバッジの演出
      }
      renderEdit({ id: record.id }); // 表示を作り直す
    } catch (err) {
      console.error(err);
      alert(shareErrorMessage(err));
      btn.disabled = false;
    }
  };
}

// 投稿を消したとき、端末側に記録が残っていれば「共有中」の印を外す。
// 記録がすでに無ければ（端末のデータが入れ替わっていた場合など）何もしない
// 共有先の投稿がもう無いときのエラーかどうか。
// みんなの記録をまとめて消したあと（リリース前のリセットなど）に起きる
function isMissingPost(err) {
  return String(err?.code ?? '').includes('not-found');
}

// サーバーから取ってきた自分の投稿と、端末側の「共有済み」の印を突き合わせて、
// もう無いものは静かに外す。
// 一覧に無いものは、別のアカウントで共有した記録の可能性もあるので、
// 1件ずつ本当に無いかを確かめてから外す（無い投稿を読むだけなので軽い）
async function reconcileSharedLinks(posts) {
  if (!Array.isArray(posts)) return 0;
  const live = new Set(posts.map((post) => post.id));
  const records = await db.getAll('records');
  const stale = records.filter((record) => record.postId && !live.has(record.postId));
  let cleared = 0;
  for (const record of stale) {
    let post = null;
    try {
      post = await cloud.getPost(record.postId);
    } catch (err) {
      console.error(err);
      continue; // 調べられなかったものは触らない
    }
    if (post) continue; // まだある（別のアカウントで共有したものなど）
    await db.put('records', { ...record, postId: null });
    cleared += 1;
  }
  return cleared;
}

async function clearLocalPostLink(postId) {
  const records = await db.getAll('records');
  const match = records.find((r) => r.postId === postId);
  if (match) await db.put('records', { ...match, postId: null });
}

// 共有された投稿1件から、端末側の記録とお店を逆引きする。
// 端末のデータが入れ替わっていた場合は見つからず null になる。
async function shopForPost(postId) {
  const [records, shops] = await Promise.all([db.getAll('records'), db.getAll('shops')]);
  const record = records.find((r) => r.postId === postId);
  if (!record) return null;
  const shop = shops.find((s) => s.id === record.shopId);
  return shop ? { record, shop } : null;
}

function shareErrorMessage(err) {
  const code = err?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'このアカウントはまだ許可されていません。管理者に確認してください。';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return '通信できませんでした。電波の良い場所でもう一度お試しください。';
  }
  if (String(err?.message ?? '').includes('longer than')) {
    return '写真が大きすぎて共有できませんでした。';
  }
  return 'うまくいきませんでした。もう一度お試しください。';
}

/* ===================== アカウント（ログイン・プロフィール） ===================== */

async function renderAccount() {
  const alive = navGuard(); // 読み込み中に別の画面へ移ったら、あとから描き込まない
  // プロフィール画面から開くので、戻り先もそこに合わせる
  const accountBack = me.user
    ? { back: `#/user/${me.user.uid}`, backLabel: 'プロフィール' }
    : { back: '#/settings', backLabel: '設定' };

  app.innerHTML = header('アカウント', accountBack) + `<section class="account" id="account-slot">
    <p class="empty">確認しています…</p>
  </section>`;
  const slot = $('#account-slot');

  // 電波が悪いと、この確認だけで時間がかかることがある。
  // 待たせすぎたら、原因と次の一手を案内する
  const slowTimer = setTimeout(() => {
    if (!document.body.contains(slot)) return;
    slot.innerHTML = `
      <p class="empty">読み込みに時間がかかっています。<br>電波の良い場所でお試しください。</p>
      <button type="button" class="btn btn-ghost btn-block" id="account-retry">もう一度試す</button>`;
    $('#account-retry').onclick = () => renderAccount();
  }, 8000);

  // ログイン状態を1回だけ確認する（画面はこのあと自分で作り直すので、以降の変化は見ない）
  let unsubscribe = () => {};
  let handled = false;
  unsubscribe = cloud.watchAuth(async (user) => {
    if (handled) return; // 2回目以降の通知は無視する
    handled = true;
    clearTimeout(slowTimer);
    unsubscribe();
    if (!alive()) return;
    if (!user) {
      renderLoginForm(slot);
      return;
    }
    let profile = null;
    let myCount = 0;
    try {
      profile = await cloud.getProfile(user.uid);
    } catch (err) {
      console.error(err);
    }
    try {
      myCount = (await cloud.getPostsByUser(user.uid)).length;
    } catch (err) {
      console.error(err);
    }
    if (!alive()) return;
    renderProfileForm(slot, user, profile, myCount);
  });
}

// 目のマーク。open=true のときは「今は見えている」ので斜線入りにする
function eyeIcon(open) {
  const base = '<path d="M1 10c2.6-4 5.6-6 9-6s6.4 2 9 6c-2.6 4-5.6 6-9 6s-6.4-2-9-6z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/>';
  const slash = open ? '<path d="M3 3l14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' : '';
  return `<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">${base}${slash}</svg>`;
}

function renderLoginForm(slot) {
  slot.innerHTML = `
    <p>身内だけで記録を見せ合うための、簡単なログインです。まだ登録していなければ、下のフォームでそのまま作成できます。</p>

    <form id="auth-form" novalidate>
      <div class="field">
        <label for="auth-email">メールアドレス</label>
        <input id="auth-email" type="email" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="auth-password">パスワード<small>（6文字以上）</small></label>
        <div class="pw-row">
          <input id="auth-password" type="password" autocomplete="current-password" required minlength="6">
          <button type="button" class="pw-eye" id="auth-eye" aria-label="パスワードを表示" aria-pressed="false">
            ${eyeIcon(false)}
          </button>
        </div>
      </div>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" id="auth-submit">ログイン</button>
      <button type="button" class="btn btn-ghost btn-block" id="auth-toggle">初めての方はこちら（新規登録）</button>
    </form>`;

  // 目のマークでパスワードの表示・非表示を切り替える
  const pwInput = $('#auth-password');
  const eyeBtn = $('#auth-eye');
  eyeBtn.onclick = () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    eyeBtn.innerHTML = eyeIcon(show);
    eyeBtn.setAttribute('aria-pressed', String(show));
    eyeBtn.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
    pwInput.focus();
  };

  const form = $('#auth-form');
  const submitBtn = $('#auth-submit');
  const toggleBtn = $('#auth-toggle');
  const errorEl = $('#auth-error');
  let mode = 'signin';

  toggleBtn.onclick = () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    submitBtn.textContent = mode === 'signin' ? 'ログイン' : 'アカウントを作成';
    toggleBtn.textContent = mode === 'signin' ? '初めての方はこちら（新規登録）' : 'すでに登録済みの方はこちら';
    errorEl.textContent = '';
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    submitBtn.disabled = true;
    try {
      if (mode === 'signin') await cloud.signIn(email, password);
      else await cloud.signUp(email, password);
      renderAccount();
    } catch (err) {
      console.error(err);
      errorEl.textContent = authErrorMessage(err);
      submitBtn.disabled = false;
    }
  };
}

// Firebaseのエラーコードを、画面にそのまま出しても分かる日本語にする
function authErrorMessage(err) {
  const code = err?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'メールアドレスかパスワードが違います。';
  }
  if (code.includes('email-already-in-use')) return 'このメールアドレスはすでに登録されています。';
  if (code.includes('weak-password')) return 'パスワードは6文字以上にしてください。';
  if (code.includes('invalid-email')) return 'メールアドレスの形式が正しくありません。';
  if (code.includes('permission-denied')) return 'このアカウントはまだ許可されていません。管理者に確認してください。';
  if (code.includes('network')) return '通信できませんでした。電波の良い場所でもう一度お試しください。';
  return 'うまくいきませんでした。もう一度お試しください。';
}

function renderProfileForm(slot, user, profile, myCount = 0) {
  const avatarUrl = profile?.avatar ?? null;
  const eligibleTier = badgeTierForCount(myCount);
  let badgeChoice = Math.min(profile?.badgeChoice ?? eligibleTier, eligibleTier);

  slot.innerHTML = `
    <p class="hint">${esc(user.email)} でログイン中</p>

    <form id="profile-form" novalidate>
      <div class="field">
        <span class="label">アイコン</span>
        <div class="photo-pick avatar-pick">
          <img id="pf-preview" alt="選んだアイコン" ${avatarUrl ? '' : 'hidden'} ${avatarUrl ? `src="${avatarUrl}"` : ''}>
          <span id="pf-noimage" ${avatarUrl ? 'hidden' : ''}>${noImage}</span>
        </div>
        <div class="photo-actions">
          <label class="btn btn-ghost">
            画像を選ぶ
            <input id="pf-photo" type="file" accept="image/*" class="visually-hidden">
          </label>
          <button type="button" class="btn btn-ghost" id="pf-photo-remove" ${avatarUrl ? '' : 'hidden'}>外す</button>
        </div>
        <p class="hint">用意してあるアイコンから選ぶこともできます。</p>
        <ul class="avatar-presets" id="avatar-presets">
          ${DEFAULT_AVATARS.map((a) => `
            <li>
              <button type="button" class="preset-btn" data-preset="${a.id}" aria-label="${esc(a.name)}">
                <img src="${a.id}" alt="">
              </button>
            </li>`).join('')}
        </ul>
      </div>

      <div class="field">
        <label for="pf-name">ニックネーム</label>
        <input id="pf-name" type="text" maxlength="20" required value="${esc(profile?.nickname)}" placeholder="例：ほし">
      </div>

      <div class="field">
        <label for="pf-bio">ひとこと</label>
        <textarea id="pf-bio" rows="2" maxlength="60" placeholder="よろしくお願いします">${esc(profile?.bio)}</textarea>
      </div>

      <div class="field">
        <span class="label">名前に付けるバッジ</span>
        <div class="badge-now">
          ${badgeChoice ? badgeImg(badgeChoice) : '<span class="badge-none">付けていない</span>'}
          <span class="badge-now-name">${badgeChoice ? esc(badgeByTier(badgeChoice)?.name ?? '') : ''}</span>
        </div>
        ${badgeGauge(myCount)}
      </div>

      <div class="field">
        <span class="label">公開する情報</span>
        <p class="hint">他ユーザーが閲覧できる項目を設定する。</p>
        <label class="check-row">
          <input type="checkbox" id="pf-zukan" ${profile?.showZukan === false ? '' : 'checked'}>
          <span>図鑑を見せる</span>
        </label>
        <label class="check-row">
          <input type="checkbox" id="pf-calendar" ${profile?.showCalendar === false ? '' : 'checked'}>
          <span>カレンダーを見せる</span>
        </label>
      </div>

      <p class="form-error" id="pf-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" id="pf-submit">保存する</button>
    </form>

    <button type="button" class="btn btn-ghost btn-block" id="pf-logout">ログアウト</button>`;

  const preview = $('#pf-preview');
  const noImageEl = $('#pf-noimage');
  const removeBtn = $('#pf-photo-remove');
  const errorEl = $('#pf-error');
  let avatarChange; // undefined = 変更なし / null = 外す / 'data:...' = 新しい画像

  function showAvatar(url) {
    preview.hidden = !url;
    noImageEl.hidden = Boolean(url);
    removeBtn.hidden = !url;
    if (url) preview.src = url;
  }

  $('#pf-photo').onchange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    errorEl.textContent = '';
    const blob = await cropImage(file);
    if (!blob) return; // やめるを押した
    avatarChange = await blobToDataUrl(blob);
    showAvatar(avatarChange);
  };

  removeBtn.onclick = () => {
    avatarChange = null;
    showAvatar(null);
  };

  // 用意してあるアイコンを選んだとき
  $('#avatar-presets').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-preset]');
    if (!btn) return;
    avatarChange = btn.dataset.preset;
    showAvatar(avatarChange);
  });

  $('#profile-form').onsubmit = async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const nickname = $('#pf-name').value.trim();
    if (!nickname) {
      errorEl.textContent = 'ニックネームを入力してください。';
      return;
    }
    const submitBtn = $('#pf-submit');
    submitBtn.disabled = true;
    try {
      const next = {
        nickname,
        bio: $('#pf-bio').value.trim(),
        showZukan: $('#pf-zukan').checked,
        showCalendar: $('#pf-calendar').checked,
        badgeChoice,
      };
      if (avatarChange !== undefined) next.avatar = avatarChange; // null なら外す
      await cloud.saveProfile(user.uid, next);
      me.profile = { ...me.profile, ...next }; // 右上のアイコンなどにすぐ反映させる
      profileCache.set(user.uid, me.profile);  // 過去の投稿やコメントの表示も新しくする
      toast('プロフィールを保存しました');
      goBack('#/settings');
    } catch (err) {
      console.error(err);
      errorEl.textContent = authErrorMessage(err);
      submitBtn.disabled = false;
    }
  };

  $('#pf-logout').onclick = async () => {
    if (!confirm('ログアウトしますか？')) return;
    await cloud.signOutUser();
    renderAccount();
  };
}



const routes = [
  { path: /^\/$/, view: renderHome },
  { path: /^\/zukan$/, view: renderZukan },
  { path: /^\/calendar$/, view: renderCalendar },
  { path: /^\/shop\/([\w-]+)$/, view: renderShop },
  { path: /^\/new$/, view: renderNew },
  { path: /^\/edit\/([\w-]+)$/, view: renderEdit },
  { path: /^\/settings$/, view: renderSettings },
  { path: /^\/account$/, view: renderAccount },
  { path: /^\/gacha$/, view: renderGacha },
  { path: /^\/badges$/, view: renderBadges },
  { path: /^\/feed$/, view: renderFeed },
  { path: /^\/post\/([\w-]+)$/, view: renderPost },
  { path: /^\/user\/([\w@.-]+)$/, view: renderUser },
  { path: /^\/follows\/([\w@.-]+)$/, view: renderFollows },
  { path: /^\/recommend$/, view: renderRecommend },
  { path: /^\/nearby$/, view: renderNearby },
  { path: /^\/news$/, view: renderNews },
  { path: /^\/news\/([\w.-]+)$/, view: renderNewsDetail },
  { path: /^\/search$/, view: renderSearch },
  { path: /^\/points$/, view: renderPoints },
  { path: /^\/myposts$/, view: renderMyPosts },
  { path: /^\/posts\/([\w@.-]+)$/, view: renderUserPosts },
  { path: /^\/about-chiki$/, view: renderAboutChiki },
];

let swipedBack = false; // 右スワイプで戻ってきたところかどうか
let swipedUp = false; // ホームから上スワイプでみんなの記録に来たところかどうか

// 画面を切り替えるときに軽く滑らせる
function playPageIn(back) {
  // スワイプでずらした位置を、動きを付けずに戻す（揺れ戻りを防ぐ）
  app.style.transition = 'none';
  app.style.transform = '';
  app.classList.remove('page-in', 'page-back', 'page-slide-back', 'page-rise-in');
  void app.offsetWidth; // 作り直して毎回動かす
  if (swipedUp) {
    swipedUp = false;
    app.classList.add('page-rise-in'); // ホームから上スワイプで来たとき、下から滑り込む
    return;
  }
  if (swipedBack) {
    swipedBack = false;
    app.classList.add('page-slide-back'); // 上の画面が左から入ってくる
    return;
  }
  app.classList.add(back ? 'page-back' : 'page-in');
}

// 画面を切り替えるたびに1つ増える番号。
// 読み込みに時間がかかる画面で、待っている間に別の画面へ移っていたら、
// あとから届いた結果で今の画面を上書きしないようにするために使う。
// （以前は、プロフィールの読み込み中にホームへ戻ると、あとからプロフィールが
//   描き込まれ、URLはホームのままなので「戻る」が効かなくなっていた）
let navSeq = 0;
function navGuard() {
  const seq = navSeq;
  return () => seq === navSeq;
}

async function router() {
  const seq = ++navSeq;
  // 前の画面がFirebaseを見張ったままにならないよう、毎回止めてから進む
  stopFeed();
  stopPost();
  backTarget = null; // このあと header が呼ばれたときに入る（ホームでは呼ばれない）

  const here = location.hash.slice(1) || '/';
  const [path, queryString = ''] = here.split('?');
  const query = new URLSearchParams(queryString);
  const movedBack = trackVisit(here); // 通ってきた道すじに書き込む

  for (const route of routes) {
    const match = path.match(route.path);
    if (!match) continue;
    try {
      await route.view({ id: match[1], query });
    } catch (err) {
      console.error(err);
      if (seq !== navSeq) return;
      app.innerHTML = header('エラー') + `
        <p class="empty">データを読み込めませんでした。アプリを開き直してください。<br>
        <small>${esc(err.message)}</small></p>`;
    }
    if (seq !== navSeq) return; // 待っている間に別の画面へ移っていた
    playPageIn(movedBack);
    window.scrollTo(0, 0);
    return;
  }
  goReplace('#/');
}

// 「戻る」ボタン（画面ごとに作り直されるので、親要素でまとめて受け取る）
app.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="back"]')) goBack();

  const kebab = event.target.closest('[data-postmenu]');
  if (kebab) {
    event.preventDefault();
    openPostMenu(kebab, kebab.dataset.postmenu);
  }
});

enableSwipeBack(app); // 右スワイプでひとつ上の画面に戻れるようにする（登録は1回だけ）
enableHomeSwipeUp(app); // ホームでは下から上へのスワイプでみんなの記録へ行けるようにする（登録は1回だけ）

loadChikiState().then(() => {
  // ホームを開いた状態で読み込みが終わったら、餌やりボタンの見た目を合わせる
  if ((location.hash.slice(1) || '/').split('?')[0] === '/') router();
});

window.addEventListener('hashchange', router);
router();

// 起動したらすぐ版を調べ、古ければ更新の画面でふさぐ。
// スマホのアプリは閉じずに行き来することが多いので、戻ってきたときにも調べる
checkVersionGate({ force: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkVersionGate();
});

// オフラインでも開けるようにする仕組み（Service Worker）を登録
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker 登録失敗', err));
}
