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
//   #/settings    バックアップ・設定
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

function goBack(fallback = '#/') {
  if (history.length > 1) history.back();
  else location.hash = fallback;
}

// 画面ごとの「ひとつ上」。画面の深さを数えるときの目安に使う。
// 実際にスワイプで戻る先は、左上のボタンと同じ backTarget を使う
// （自分のプロフィールのように、同じURLでも行き先が変わる画面があるため）。
function parentOf(path) {
  if (path === '/') return null;                 // ホームではこれ以上戻らない
  if (path.startsWith('/post/')) return '#/feed';
  if (path.startsWith('/user/')) return '#/feed';
  if (path.startsWith('/follows/')) return `#/user/${path.split('/')[2]}`;
  if (path.startsWith('/shop/')) return '#/zukan';
  if (path === '/nearby') return '#/zukan';
  if (path === '/account') return '#/settings';
  if (path === '/gacha') return '#/';
  if (path === '/badges') return '#/account';
  return '#/';
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
      place(S, true); // 指の動きの続きとして、画面の外まで流す
      setTimeout(() => {
        busy = false;
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
  if (path === '/' || path === '/feed' || path.startsWith('/post/')) router();
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
    <a class="am-item" href="#/settings">バックアップ・設定</a>
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
        <div class="crop-stage"><img class="crop-img" alt=""></div>
        <div class="crop-tools">
          <button type="button" class="step" data-crop="out" aria-label="縮小">−</button>
          <input class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="拡大">
          <button type="button" class="step" data-crop="in" aria-label="拡大">＋</button>
        </div>
        <p class="crop-hint">指でドラッグすると動かせます。2本指またはスライダーで拡大できます。</p>
      </div>`;
    document.body.appendChild(host);

    const stage = host.querySelector('.crop-stage');
    const view = host.querySelector('.crop-img');
    const zoom = host.querySelector('.crop-zoom');
    view.src = url;

    const S = stage.clientWidth;            // 枠の一辺（画面上の大きさ）
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // 倍率1のときに写真全体がちょうど収まるようにする
    const base = Math.min(S / nw, S / nh);

    let k = 1;    // 拡大の倍率
    let tx = 0;   // 写真の左上が枠のどこにあるか
    let ty = 0;

    function apply() {
      const w = nw * base * k;
      const h = nh * base * k;
      // 枠より小さい向きは中央に、大きい向きは枠の外に隙間ができないように収める
      tx = w <= S ? (S - w) / 2 : Math.min(0, Math.max(S - w, tx));
      ty = h <= S ? (S - h) / 2 : Math.min(0, Math.max(S - h, ty));
      view.style.width = `${w}px`;
      view.style.height = `${h}px`;
      view.style.transform = `translate(${tx}px, ${ty}px)`;
      zoom.value = k;
    }

    // 指定した点を動かさずに拡大率だけ変える
    function zoomTo(next, cx = S / 2, cy = S / 2) {
      const clamped = Math.max(1, Math.min(4, next));
      const ratio = clamped / k;
      tx = cx - (cx - tx) * ratio;
      ty = cy - (cy - ty) * ratio;
      k = clamped;
      apply();
    }

    apply();

    // --- 指の操作（1本でドラッグ、2本でつまんで拡大） ---
    const points = new Map();
    let pinch = null;

    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinch = null;
    });

    stage.addEventListener('pointermove', (e) => {
      if (!points.has(e.pointerId)) return;
      e.preventDefault();
      const prev = points.get(e.pointerId);
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (points.size >= 2) {
        const [a, b] = [...points.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const box = stage.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - box.left;
        const cy = (a.y + b.y) / 2 - box.top;
        if (pinch) zoomTo(k * (dist / pinch.dist), cx, cy);
        pinch = { dist };
      } else {
        tx += e.clientX - prev.x;
        ty += e.clientY - prev.y;
        apply();
      }
    });

    function release(e) {
      points.delete(e.pointerId);
      if (points.size < 2) pinch = null;
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    zoom.addEventListener('input', () => zoomTo(Number(zoom.value)));

    // --- ボタン ---
    function finish(blob) {
      document.body.classList.remove('no-scroll');
      host.remove();
      URL.revokeObjectURL(url);
      resolve(blob);
    }

    host.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-crop]')?.dataset.crop;
      if (!action) return;
      if (action === 'in') { zoomTo(k + 0.25); return; }
      if (action === 'out') { zoomTo(k - 0.25); return; }
      if (action === 'cancel') { finish(null); return; }

      // 画面で見えている範囲をそのまま正方形に描き出す
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUT;
      canvas.height = CROP_OUT;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2A251F'; // 余白が出たときの下地
      ctx.fillRect(0, 0, CROP_OUT, CROP_OUT);
      const r = CROP_OUT / S;
      ctx.drawImage(img, tx * r, ty * r, nw * base * k * r, nh * base * k * r);
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
  backTarget = back;
  const backEl = back === 'history'
    ? '<button type="button" class="back" data-action="back">‹ 戻る</button>'
    : `<a class="back" href="${back}">‹ ${esc(backLabel)}</a>`;
  return `<header class="bar">${backEl}<h1 class="bar-title">${esc(title)}</h1></header>`;
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

let chikiState = { points: 0, lastFed: null, owned: [], equipped: null, redeemedCodes: [] };
let chikiReady = false;

async function loadChikiState() {
  try {
    const saved = await db.get('chiki', 'me');
    if (saved) chikiState = { points: 0, lastFed: null, owned: [], equipped: null, redeemedCodes: [], ...saved };
  } catch (err) {
    console.error(err);
  }
  chikiReady = true;
}

function saveChikiState() {
  return db.put('chiki', { id: 'me', ...chikiState });
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
  chikiState = { ...chikiState, points: chikiState.points + amount, lastFed: todayStr() };
  await saveChikiState();
  return amount;
}

const GACHA_COST = 30;
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
  chikiState = {
    ...chikiState,
    points: chikiState.points - GACHA_COST + refund,
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
  if (!subject) return '一杯目、待ってる。';

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

  const streak = streakDays(records, subject.date);
  if (streak === 2) pool.push('2日連続か。');
  if (streak === 3 || streak === 4) pool.push(`${streak}日続けて……ギルティ。`);
  if (streak >= 5) pool.push('もう生活だな。');

  const hour = new Date(subject.createdAt).getHours();
  if (hour >= 5 && hour < 10) pool.push('朝から行ったのか。');
  if (hour >= 22 || hour < 2) pool.push('こんな時間に……ギルティ。');
  if (hour >= 2 && hour < 5) pool.push('もう朝じゃないか。');

  // おすすめの一杯があれば、他の一言と同じ扱いで混ぜる（毎回出るわけではない）
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
  const { shops, records, shopMap } = await loadAll();
  const thisMonth = todayStr().slice(0, 7);
  const monthCount = records.filter((r) => r.date.startsWith(thisMonth)).length;
  const newest = [...records].sort(byNewest);
  const recent = newest.slice(0, 5);

  // 記録した直後はその一杯について話す。
  // それ以外は最近の10杯から毎回選び直すので、開くたびに話題が変わる。
  const justSaved = lastSavedId ? records.find((r) => r.id === lastSavedId) : null;
  lastSavedId = null;
  const subject = justSaved ?? (newest.length ? pick(newest.slice(0, 10)) : null);
  const rec = recommendOne(records, shopMap);
  const unread = await newsUnreadCount();
  const talk = chikiTalk(records, subject, rec ? [rec.line] : []);
  const showRecLink = Boolean(rec) && talk === rec.line;
  const talkSub = subject
    ? `${shopName(shopMap, subject.shopId)}・${subject.score}点`
    : '記録するボタンから始められる';

  app.innerHTML = `
    <section class="home">
      <div class="home-top">
        <div>
          <h1 class="app-title">ラーメン記録</h1>
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
  const read = await newsReadVersion();
  const unreadCount = await newsUnreadCount();

  // 通知がまだ有効になっていない人にだけ、ここからも有効にできるようにする
  const canOfferNotif = me.user
    && await notificationsAvailable()
    && !localStorage.getItem(FCM_TOKEN_KEY)
    && Notification.permission !== 'denied';

  app.innerHTML = header('お知らせ', { back: '#/' }) + `
    <section class="news">
      ${canOfferNotif ? `
        <div class="news-notif">
          <p>通知を有効にすると、身内の新しい共有やギルティ・コメントにすぐ気づけます。</p>
          <button type="button" class="btn btn-primary btn-block" id="news-notif-enable">通知を有効にする</button>
        </div>` : ''}
      <ul class="news-list">
        ${CHANGELOG.map((entry, i) => `
          <li class="news-item${i < unreadCount ? ' is-unread' : ''}">
            <div class="news-head">
              <span class="news-title">${esc(entry.title)}</span>
              ${i < unreadCount ? '<span class="news-new">NEW</span>' : ''}
            </div>
            <span class="news-meta">${esc(entry.date)}　${esc(entry.version.replace('ramen-log-', ''))}</span>
            <ul class="news-points">
              ${entry.items.map((t) => `<li>${esc(t)}</li>`).join('')}
            </ul>
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
  if (read !== CHANGELOG[0]?.version) await markNewsRead();
}

/* ===================== おすすめの一杯 ===================== */

async function renderRecommend() {
  const { records, shopMap } = await loadAll();
  const rec = recommendOne(records, shopMap);

  if (!rec) {
    app.innerHTML = header('おすすめの一杯', { back: '#/' })
      + '<p class="empty">今はおすすめできる一杯がありません。記録が増えると出てきます。</p>';
    return;
  }

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
  if (!me.user) {
    location.replace('#/settings');
    return;
  }

  app.innerHTML = header('バッジ', { back: '#/account', backLabel: 'アカウント' })
    + '<p class="empty">読み込んでいます…</p>';

  let count = 0;
  try {
    count = (await cloud.getPostsByUser(me.user.uid)).length;
  } catch (err) {
    console.error(err);
    app.innerHTML = header('バッジ', { back: '#/account', backLabel: 'アカウント' })
      + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  const eligibleTier = badgeTierForCount(count);
  let choice = Math.min(me.profile?.badgeChoice ?? eligibleTier, eligibleTier);

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
  await loadChikiState();

  app.innerHTML = header('ギルチキガチャ') + `
    <div class="gacha-head">
      <div class="gacha-mascot">${mascot(80)}</div>
      <p class="gacha-points">${chikiState.points}<small>pt</small></p>
      <p class="hint">餌をあげるとポイントがもらえる。ホームのギルチキをタップ。</p>
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

async function renderZukan() {
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
  const { shops } = await loadAll();
  const shopNames = shops.map((s) => s.name);
  const used = await nearbyUsageToday();
  const remaining = NEARBY_DAILY_LIMIT - used;

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
  const { records, shopMap } = await loadAll();
  const shop = shopMap.get(id);
  if (!shop) { location.replace('#/zukan'); return; }

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
    location.replace('#/zukan');
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
  if (!record) { location.replace('#/'); return; }
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
  const members = me.user ? await loadMembers() : [];
  // 今この記録に付いている人。もう抜けた人が残らないよう、一覧にいる人だけに絞る
  const withUids = new Set(
    (record?.withUids ?? saved0?.withUids ?? []).filter((uid) => members.some((m) => m.uid === uid)),
  );

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
          await maybeCelebrateBadge(); // 区切りに届いていたらバッジの演出
        } catch (err) {
          console.error(err);
          toast('記録はできましたが、共有に失敗しました');
        }
      }

      // 共有済みの記録を編集したときは、みんなの記録の側も書き換える。
      // ここで失敗しても端末の記録はもう保存できているので、知らせるだけにする。
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
          toast('変更は保存しましたが、共有側に反映できませんでした');
        }
      }

      if (saved.score >= GUILTY) {
        await guiltyFlash(isEdit ? `${name}・${saved.score}点` : `${name}（${nth}回目）・${saved.score}点`);
      }

      if (isEdit) {
        if (saved.score < GUILTY) toast('変更を保存しました');
        goBack();
      } else {
        if (saved.score < GUILTY) toast(`${name}に記録しました（${nth}回目）`);
        location.replace('#/');
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
  } catch (err) {
    console.error(err);
    toast(shareErrorMessage(err));
  }
}

function postCard(post, { withLastComment = true } = {}) {
  // 写真は押すと直接拡大表示になる。投稿本文への遷移とは別の操作にするため、
  // <a class="post-body"> の中にあってもボタンとして扱う（クリックはJS側で止める）。
  const photo = post.photo
    ? `<button type="button" class="post-photo is-zoomable" data-zoom aria-label="写真を拡大">
         <img src="${post.photo}" alt="" loading="lazy">
       </button>`
    : '';
  const comment = (post.comment ?? '').trim();
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
      <a class="post-body" href="#/post/${post.id}">
        ${photo}
        <div class="post-lines">
          <span class="post-shop">${esc(post.shopName)}</span>
          <span class="post-menu">${esc(post.menu)}</span>
          ${comment ? `<span class="post-comment">${esc(comment)}</span>` : ''}
        </div>
        <span class="post-score${post.score >= GUILTY ? ' is-guilty' : ''}">${post.score}<small>点</small></span>
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

  app.innerHTML = header('みんなの記録') + (hasFollows ? `
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
    <div class="viewer-stage"><img class="viewer-img" src="${src}" alt=""></div>`;
  document.body.appendChild(host);
  document.body.classList.add('no-scroll');

  const img = host.querySelector('.viewer-img');
  const stage = host.querySelector('.viewer-stage');
  let k = 1;   // 拡大の倍率
  let tx = 0;  // 位置
  let ty = 0;

  function apply() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  const points = new Map();
  let pinch = null;

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = null;
  });

  stage.addEventListener('pointermove', (event) => {
    if (!points.has(event.pointerId)) return;
    const prev = points.get(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (points.size >= 2) {
      const [a, b] = [...points.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) k = Math.max(1, Math.min(5, k * (dist / pinch.dist)));
      pinch = { dist };
      if (k === 1) { tx = 0; ty = 0; }
      apply();
    } else if (k > 1) {
      tx += event.clientX - prev.x;
      ty += event.clientY - prev.y;
      apply();
    }
  });

  function release(event) {
    points.delete(event.pointerId);
    if (points.size < 2) pinch = null;
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // 画像を2回たたくと、拡大と等倍を行き来する
  let lastTap = 0;
  stage.addEventListener('click', () => {
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
    location.replace('#/feed');
    return;
  }

  app.innerHTML = header('記録', { back: '#/feed', backLabel: 'みんなの記録' }) + `
    <div id="post-slot"><p class="empty">読み込んでいます…</p></div>

    <div class="comment-open">
      <button type="button" class="icon-btn is-big" id="comment-open" aria-expanded="false">
        ${commentIcon()}<span>コメントを書く</span>
      </button>
    </div>

    <form class="comment-form" id="comment-form" hidden>
      <textarea id="comment-text" rows="2" maxlength="200" placeholder="コメントを書く"></textarea>
      <div class="comment-form-foot">
        <span class="hint" id="reply-to"></span>
        <button type="button" class="btn btn-ghost" id="comment-cancel">やめる</button>
        <button type="submit" class="btn btn-primary" id="comment-send">送信</button>
      </div>
    </form>

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

  let replyTo = null; // 返信先のコメント（なければ通常のコメント）

  function openForm() {
    form.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    form.classList.remove('is-opening');
    void form.offsetWidth;
    form.classList.add('is-opening'); // すっと開く動き
    box.focus();
  }
  function closeForm() {
    form.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    replyTo = null;
    replyLabel.textContent = '';
    box.value = '';
  }

  openBtn.onclick = () => (form.hidden ? openForm() : closeForm());

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
      slot.innerHTML = `<ul class="post-list">${postCard(post, { withLastComment: false })}</ul>`;
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
    list.innerHTML = comments.length ? commentTree(comments) : '<li class="empty">まだコメントはありません。</li>';
    restorePop(list);
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
    const replyBtn = event.target.closest('[data-reply]');
    if (replyBtn) {
      replyTo = { id: replyBtn.dataset.reply, nickname: replyBtn.dataset.replyName };
      replyLabel.textContent = `${replyTo.nickname} さんへの返信`;
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
        parentId: replyTo?.id ?? null,
      });
      closeForm();
    } catch (err) {
      console.error(err);
      toast(shareErrorMessage(err));
    }
    sendBtn.disabled = false;
  };

}

// コメントを「元のコメント → その返信」の順に組み立てる（返信は1段まで）
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
    .map((c) => commentRow(c) + (repliesOf.get(c.id) ?? []).map((r) => commentRow(r, true)).join(''))
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

function commentRow(c, isReply = false) {
  const mine = me.user && c.uid === me.user.uid;
  return `
    <li class="comment${isReply ? ' is-reply' : ''}">
      <a class="comment-user" href="#/user/${c.uid}">${avatarFor(c.uid, c.nickname, c.avatar)}</a>
      <div class="comment-body">
        <span class="comment-head">
          <a class="comment-who" href="#/user/${c.uid}">${esc(nameFor(c.uid, c.nickname))}</a>
          <span class="comment-when">${esc(whenText(c.createdAt))}</span>
        </span>
        <p class="comment-text">${esc(c.text)}</p>
        <div class="comment-actions">
          ${commentGuiltyButton(c)}
          ${isReply ? '' : `<button type="button" class="mini-btn" data-reply="${c.id}" data-reply-name="${esc(c.nickname || '名無し')}">返信</button>`}
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

async function renderFollows({ id, query }) {
  if (!me.user) {
    location.replace('#/feed');
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
    app.innerHTML = header(title, backTo) + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  // 自分のフォローは、今この場で押した結果をすぐ反映したいので me.profile を優先する
  const theirFollows = (id === me.user.uid ? me.profile?.follows : profile?.follows) ?? [];
  const list = type === 'followers'
    ? members.filter((m) => (m.follows ?? []).includes(id))
    : members.filter((m) => theirFollows.includes(m.uid));

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
  if (!me.user) {
    location.replace('#/feed');
    return;
  }

  const isMe = id === me.user.uid;
  // 自分のプロフィールはホームから開くので、戻り先もホームにする
  const backTo = isMe ? { back: '#/', backLabel: 'ホーム' } : { back: '#/feed', backLabel: 'みんなの記録' };

  app.innerHTML = header('プロフィール', backTo)
    + '<p class="empty">読み込んでいます…</p>';

  let profile = null;
  let posts = [];
  let tagged = []; // この人が「一緒に食べた人」として出ている、他の人の記録
  let members = []; // フォロー数・フォロワー数を数えるために全員分を読む
  try {
    [profile, posts, tagged, members] = await Promise.all([
      cloud.getProfile(id),
      cloud.getPostsByUser(id),
      cloud.getPostsTaggedWith(id),
      cloud.getMembers().catch(() => []), // 読めなくてもプロフィール自体は出す
    ]);
  } catch (err) {
    console.error(err);
    app.innerHTML = header('プロフィール', backTo)
      + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  const name = profile?.nickname ?? '名無し';
  const bio = (profile?.bio ?? '').trim();
  const shopNames = new Set(posts.map((p) => p.shopName));
  // 公開設定。決めていない人は「見せる」扱いにする
  const showZukan = profile?.showZukan !== false;
  const showCalendar = profile?.showCalendar !== false;

  // 表示するバッジ：本人が選んだ段階。ただし今解放されている段階までに収める
  // （共有をやめて杯数が減っていた場合、選んでいた段階が使えなくなることがあるため）
  const eligibleTier = badgeTierForCount(posts.length);
  const badgeTier = Math.min(profile?.badgeChoice ?? eligibleTier, eligibleTier);

  // フォロー数・フォロワー数。自分のプロフィールを見ているときは、
  // 今この場で押した結果をすぐ反映したいので me.profile の方を優先する
  const theirFollows = (isMe ? me.profile?.follows : profile?.follows) ?? [];
  const followingCount = theirFollows.length;
  const followerCount = members.filter((m) => (m.follows ?? []).includes(id)).length;

  app.innerHTML = header('プロフィール', backTo) + `
    <section class="user">
      <div class="user-head">
        <span class="user-avatar"><img src="${avatarOf(profile?.avatar)}" alt=""></span>
        <div class="user-lines">
          <h2 class="user-name">${esc(name)}${badgeImg(badgeTier)}</h2>
          ${bio ? `<p class="user-bio">${esc(bio)}</p>` : ''}
          <div class="follow-stats">
            <a href="#/follows/${id}?type=following"><strong>${followingCount}</strong>フォロー中</a>
            <a href="#/follows/${id}?type=followers"><strong>${followerCount}</strong>フォロワー</a>
          </div>
        </div>
      </div>

      ${isMe
        ? '<a class="btn btn-ghost btn-block" href="#/account">プロフィールを編集</a>'
        : `<div class="user-actions">
             <button type="button" class="follow-btn${isFollowing(id) ? ' is-on' : ''}" id="follow-btn">
               ${isFollowing(id) ? 'フォロー中' : 'フォローする'}
             </button>
             <button type="button" class="bell-btn${isMuted(id) ? ' is-muted' : ''}" id="mute-btn"
               aria-pressed="${isMuted(id)}"
               aria-label="${isMuted(id) ? 'この人のお知らせを受け取る' : 'この人のお知らせを切る'}">
               ${bellIcon(isMuted(id))}
             </button>
           </div>`}

      <dl class="shop-stats">
        <div><dt>共有</dt><dd>${posts.length}<small>杯</small></dd></div>
        <div><dt>お店</dt><dd>${shopNames.size}<small>店</small></dd></div>
        <div><dt>最高</dt><dd>${posts.length ? Math.max(...posts.map((p) => p.score)) : '–'}<small>点</small></dd></div>
      </dl>

      ${showZukan ? `
        <h2 class="section-title">図鑑</h2>
        <div id="user-zukan"></div>` : ''}

      ${showCalendar ? `
        <h2 class="section-title">カレンダー</h2>
        <div id="user-cal"></div>` : ''}

      ${!showZukan && !showCalendar
        ? '<p class="empty">このユーザーは図鑑とカレンダーを公開していません。</p>'
        : ''}

      ${tagged.length ? `
        <h2 class="section-title">一緒に食べた記録</h2>
        <ul class="post-list" id="user-tagged"></ul>` : ''}
    </section>`;

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
        renderUser({ id });
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
        renderUser({ id });
      } catch (err) {
        console.error(err);
        toast(shareErrorMessage(err));
        muteBtn.disabled = false;
      }
    };
  }

  if (showZukan) renderUserZukan($('#user-zukan'), posts);
  if (showCalendar) renderUserCalendar($('#user-cal'), posts);

  // 一緒に食べた記録。書いたのは別の人なので、その人の名前とアイコンを先に読む
  const taggedSlot = $('#user-tagged');
  if (taggedSlot) {
    const draw = () => {
      if (!document.body.contains(taggedSlot)) return;
      taggedSlot.innerHTML = tagged.map((p) => postCard(p, { withLastComment: false })).join('');
    };
    draw();
    if (await ensureProfiles(tagged.flatMap((p) => [p.uid, ...(p.withUids ?? [])]))) draw();
  }
}

// 共有された記録をお店ごとにまとめて図鑑にする
function renderUserZukan(slot, posts) {
  if (!posts.length) {
    slot.innerHTML = '<p class="empty">共有された記録がありません。</p>';
    return;
  }
  const byShop = new Map();
  // 古い順に見て、最初の1件を「初めて食べた時」として扱う
  const oldest = [...posts].reverse();
  for (const p of oldest) {
    if (!byShop.has(p.shopName)) byShop.set(p.shopName, { first: p, count: 0 });
    byShop.get(p.shopName).count += 1;
  }

  slot.innerHTML = `<ul class="zukan">${[...byShop.entries()].map(([shopNameText, v], i) => {
    const comment = (v.first.comment ?? '').trim();
    return `
      <li>
        <div class="zk-card">
          <div class="zk-photo">
            ${v.first.photo ? `<img src="${v.first.photo}" alt="" loading="lazy">` : noImage}
            <span class="zk-stamp">${v.count}<small>回</small></span>
          </div>
          <div class="zk-body">
            <span class="zk-no">No.${String(i + 1).padStart(3, '0')}</span>
            <h3 class="zk-name">${esc(shopNameText)}</h3>
            <p class="zk-comment${comment ? '' : ' is-empty'}">${comment ? esc(comment) : 'コメントがありません'}</p>
          </div>
        </div>
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

/* ===================== バックアップ・設定 ===================== */

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
const CHANGELOG = [
  {
    version: 'ramen-log-v39',
    date: '2026-09-17',
    title: '通知（プッシュ通知）',
    items: [
      '身内が新しく共有したとき、自分の投稿にギルティが付いたとき、コメントが付いたときに通知が届くようにした',
      'どの通知を受け取るかは、設定画面から種類ごとにオン・オフできる',
      'このお知らせの上にある「通知を有効にする」からも設定できる',
    ],
  },
  {
    version: 'ramen-log-v36',
    date: '2026-09-16',
    title: 'お知らせと更新のお知らせ',
    items: [
      'ホームの右上にお知らせを追加。更新内容をここで見られるようにした',
      '新しい版があるとき、アプリを開いたときに知らせるようにした',
      '「まだ行っていない近くの店」で、図鑑にあるお店に「済」の判子を付けるようにした',
    ],
  },
  {
    version: 'ramen-log-v33',
    date: '2026-09-16',
    title: 'まだ行っていない近くの店',
    items: [
      '図鑑から、現在地の近くのラーメン屋を探せるようにした',
      '図鑑にあるお店は区別して表示。1日3回まで',
    ],
  },
  {
    version: 'ramen-log-v32',
    date: '2026-09-16',
    title: 'おすすめの一杯',
    items: [
      '最近よかった系統から、しばらく食べていない一杯をギルチキが薦めるようにした',
      'セリフから「くわしく見る」で候補の一覧へ飛べる',
    ],
  },
  {
    version: 'ramen-log-v31',
    date: '2026-09-16',
    title: '投稿の編集と削除',
    items: [
      '自分の投稿の右上に「⋯」を追加。そこから編集と削除ができる',
      '記録の編集画面から住所も直せるようにした',
    ],
  },
  {
    version: 'ramen-log-v30',
    date: '2026-09-16',
    title: '共有した記録の更新',
    items: [
      '共有済みの記録を編集すると、みんなの記録にも反映されるようにした',
      '設定に「アプリの更新」を追加',
    ],
  },
  {
    version: 'ramen-log-v29',
    date: '2026-09-16',
    title: '一緒に食べた人',
    items: [
      '記録に「一緒に食べた人」を付けられるようにした',
      'プロフィールに「一緒に食べた記録」が並ぶようにした',
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
const APP_VERSION = 'ramen-log-v40';

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

// アプリを開いたときに一度だけ、新しい版が出ていないか静かに調べて知らせる。
// 同じ版について何度も出すとうるさいので、一度断られたら次の版まで黙る。
async function noticeUpdateOnLaunch() {
  let newest = null;
  try {
    newest = await latestVersion();
  } catch {
    return; // オフラインなどで調べられなければ、何も出さない
  }
  if (!newest || newest === APP_VERSION) return;

  const seen = await db.get('chiki', 'updateNoticeSeen');
  if (seen?.version === newest) return;
  await db.put('chiki', { id: 'updateNoticeSeen', version: newest });

  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `
    <span class="update-bar-text">アップデートがあります（${esc(newest.replace('ramen-log-', ''))}）</span>
    <button type="button" class="update-bar-go" id="update-bar-go">更新する</button>
    <button type="button" class="update-bar-close" id="update-bar-close" aria-label="閉じる">×</button>`;
  document.body.appendChild(bar);

  bar.querySelector('#update-bar-close').onclick = () => bar.remove();
  bar.querySelector('#update-bar-go').onclick = async () => {
    const go = bar.querySelector('#update-bar-go');
    go.disabled = true;
    go.textContent = '更新中…';
    await applyUpdate();
  };
}

async function renderSettings() {
  const { shops, records } = await loadAll();

  app.innerHTML = header('バックアップ・設定') + `
    <section class="settings">
      <h2 class="section-title">バックアップ</h2>
      <p>記録はこの端末の中にだけ保存されています。機種変更やアプリの削除に備えて、ときどき書き出しておきましょう。</p>
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

      <h2 class="section-title">保存状況</h2>
      <p>お店 ${shops.length}店　記録 ${records.length}件<span id="usage"></span></p>

      <h2 class="section-title">みんなに共有</h2>
      <p>身内で記録を見せ合う機能です。まずログインしてください。</p>
      <a class="btn btn-ghost btn-block" href="#/account">アカウント</a>

      <h2 class="section-title">共有した記録から復元</h2>
      <p class="hint">ホーム画面のアイコンを消して入れ直すと、端末の中の記録は消えてしまいます。みんなに共有した分だけは、ここから端末に戻せます。</p>
      <button type="button" class="btn btn-ghost btn-block" id="restore-shared">共有した記録を端末に戻す</button>

      ${me.user ? `
      <h2 class="section-title">通知</h2>
      <p class="hint" id="notif-state">確認しています…</p>
      <button type="button" class="btn btn-ghost btn-block" id="notif-enable" hidden>通知を有効にする</button>
      <div id="notif-toggles" hidden>
        <label class="check-row"><input type="checkbox" id="notif-post"> 身内が新しく共有したとき</label>
        <label class="check-row"><input type="checkbox" id="notif-guilty"> 自分の投稿にギルティが付いたとき</label>
        <label class="check-row"><input type="checkbox" id="notif-comment"> 自分の投稿にコメントがついたとき</label>
      </div>` : ''}

      <h2 class="section-title">アプリの更新</h2>
      <p class="hint" id="update-state">今の版：${APP_VERSION}</p>
      <button type="button" class="btn btn-ghost btn-block" id="update-btn">最新版があるか確認</button>

      <h2 class="section-title">コード</h2>
      <div class="field">
        <label for="redeem-code">コードを入力</label>
        <div class="redeem-row">
          <input id="redeem-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="コードを入力">
          <button type="button" class="btn btn-ghost" id="redeem-btn">使う</button>
        </div>
        <p class="form-error" id="redeem-error" role="alert"></p>
      </div>
    </section>`;

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
    if (!confirm(`新しい版（${newest}）があります。更新して開き直しますか？\n記録はそのまま残ります。`)) {
      updateBtn.disabled = false;
      return;
    }
    updateState.textContent = '更新しています…';
    await applyUpdate();
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
      location.replace('#/');
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
        toast('みんなに共有しました');
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
];

// 進んだのか戻ったのかを見分けるため、ホームからの遠さを数えておく
let lastDepth = 0;
let swipedBack = false; // 右スワイプで戻ってきたところかどうか
let swipedUp = false; // ホームから上スワイプでみんなの記録に来たところかどうか

function depthOf(path) {
  let n = 0;
  let p = path;
  while (parentOf(p)) {
    n += 1;
    p = parentOf(p).slice(1);
    if (n > 6) break;
  }
  return n;
}

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

async function router() {
  // 前の画面がFirebaseを見張ったままにならないよう、毎回止めてから進む
  stopFeed();
  stopPost();
  backTarget = null; // このあと header が呼ばれたときに入る（ホームでは呼ばれない）

  const [path, queryString = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(queryString);

  for (const route of routes) {
    const match = path.match(route.path);
    if (!match) continue;
    try {
      await route.view({ id: match[1], query });
    } catch (err) {
      console.error(err);
      app.innerHTML = header('エラー') + `
        <p class="empty">データを読み込めませんでした。アプリを開き直してください。<br>
        <small>${esc(err.message)}</small></p>`;
    }
    const depth = depthOf(path);
    playPageIn(depth < lastDepth);
    lastDepth = depth;
    window.scrollTo(0, 0);
    return;
  }
  location.replace('#/');
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

// 起動して少し落ち着いてから、新しい版が出ていないか調べる
setTimeout(() => { noticeUpdateOnLaunch(); }, 1500);

// オフラインでも開けるようにする仕組み（Service Worker）を登録
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker 登録失敗', err));
}
