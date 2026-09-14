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

// 画面ごとの「ひとつ上」。戻る先は履歴ではなく、この並びで決める。
// 同じ画面を行ったり来たりしていても、スワイプすれば必ずホームに近づく。
function parentOf(path) {
  if (path === '/') return null;                 // ホームではこれ以上戻らない
  if (path.startsWith('/post/')) return '#/feed';
  if (path.startsWith('/user/')) return '#/feed';
  if (path.startsWith('/shop/')) return '#/zukan';
  if (path === '/account') return '#/settings';
  return '#/';
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
    if (busy || event.touches.length !== 1 || !parentOf(path) || swipeOff(path) || inBusyArea(event.target)) {
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
      const parent = parentOf(currentPath());
      if (!parent) { place(0, true); return; }
      busy = true;
      place(S, true); // 指の動きの続きとして、画面の外まで流す
      setTimeout(() => {
        busy = false;
        swipedBack = true;  // 次の描画を「戻る向き」の動きにする
        location.hash = parent;
      }, 200);
    } else {
      place(0, true); // 足りなければ元に戻す
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

// ホーム右上に出すアイコン（プロフィール画像がなければ頭文字）
function avatarButton() {
  if (!me.user) {
    return '<a class="avatar-btn is-guest" href="#/account" aria-label="ログイン">ロ</a>';
  }
  const url = me.profile?.avatar;
  const inner = url
    ? `<img src="${url}" alt="">`
    : esc(myName().slice(0, 1));
  return `<button type="button" class="avatar-btn" id="avatar-btn" aria-label="アカウントメニュー">${inner}</button>`;
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
    <a class="am-item" href="#/account">プロフィールを編集</a>
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
function header(title, { back = '#/', backLabel = 'ホーム' } = {}) {
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

// 絵は1枚だけ。点数による違いは、傾き・跳ね・きらきら・光で表す（見た目はCSS側）
function mascot(score) {
  const tier = faceTier(score);
  const sparks = tier >= 2
    ? '<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i>'
    : '';
  return `<span class="chiki chiki-t${tier}"><img src="./giruchiki.png" alt="" draggable="false">${sparks}</span>`;
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

// ギルチキが話す一言を選ぶ。
// 当てはまるセリフをすべて集めてから、その中からランダムに1つ選ぶ。
// 優先順位をつけていないので、同じ一杯でも開くたびに違う一言になる。
function chikiTalk(records, subject) {
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
  const talk = chikiTalk(records, subject);
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
        ${avatarButton()}
      </div>

      <div class="greet">
        ${mascot(subject?.score ?? 50)}
        <p class="greet-talk">${esc(talk)}<small>${esc(talkSub)}</small></p>
      </div>

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
        <a class="ticket ticket-wide" href="#/feed">
          <span class="ticket-label">みんなの記録</span>
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

  app.innerHTML = header('図鑑') + (items.length
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
  }
  shopSelect.onchange = () => {
    updateShopUI();
    if (shopSelect.value === '__new') newShopInput.focus();
  };
  updateShopUI();

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
            photo: await photoForShare(saved.photoId),
          });
          await db.put('records', { ...saved, postId });
        } catch (err) {
          console.error(err);
          toast('記録はできましたが、共有に失敗しました');
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

function avatarChip(nickname, avatar) {
  const name = nickname || '名無し';
  return avatar
    ? `<img class="chip-avatar" src="${avatar}" alt="">`
    : `<span class="chip-avatar is-letter">${esc(name.slice(0, 1))}</span>`;
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

function postCard(post, { withLastComment = true, photoZoom = false } = {}) {
  const photo = post.photo
    ? (photoZoom
      // 詳細画面では、写真を押すと大きく見られる
      ? `<button type="button" class="post-photo is-zoomable" data-zoom aria-label="写真を拡大">
           <img src="${post.photo}" alt="">
         </button>`
      : `<div class="post-photo"><img src="${post.photo}" alt="" loading="lazy"></div>`)
    : '';
  const comment = (post.comment ?? '').trim();
  return `
    <li class="post">
      <div class="post-head">
        <a class="post-user" href="#/user/${post.uid}">
          ${avatarFor(post.uid, post.nickname, post.avatar)}
          <span class="post-who">${esc(nameFor(post.uid, post.nickname))}</span>
        </a>
        <span class="post-when">${esc(whenText(post.createdAt))}</span>
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
      <div class="post-foot">
        ${guiltyButton(post)}
        <a class="icon-btn" href="#/post/${post.id}" aria-label="コメント">
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

  app.innerHTML = header('みんなの記録') + '<ul class="post-list" id="feed"><li class="empty">読み込んでいます…</li></ul>';
  const list = $('#feed');

  function drawFeed(posts) {
    if (!document.body.contains(list)) return; // もう別の画面に移っている
    list.innerHTML = posts.length
      ? posts.map((post) => postCard(post)).join('')
      : '<li class="empty">まだ誰も共有していません。記録の編集画面から共有できます。</li>';
    restorePop(list);
  }

  feedStop = cloud.watchFeed(
    async (posts) => {
      drawFeed(posts);
      // 投稿に書かれた名前やアイコンは投稿時点のもの。
      // 最新のプロフィールが読めたら、もう一度描き直す
      const uids = posts.flatMap((p) => [p.uid, p.lastComment?.uid]);
      if (await ensureProfiles(uids)) drawFeed(posts);
    },
    (err) => {
      console.error(err);
      list.innerHTML = `<li class="empty">${esc(shareErrorMessage(err))}</li>`;
    },
  );

  // ギルティボタンは押すたびに書き込むので、一覧全体ではなく押された1つだけ相手にする
  list.onclick = async (event) => {
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

// 写真を画面いっぱいに開く。2本指でつまむと拡大、ドラッグで動かせる。
function openPhoto(src) {
  const host = document.createElement('div');
  host.className = 'viewer';
  host.innerHTML = `
    <button type="button" class="viewer-close" data-close aria-label="閉じる">×</button>
    <div class="viewer-stage"><img class="viewer-img" src="${src}" alt=""></div>
    <p class="viewer-hint">2本指でつまむと拡大できます</p>`;
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

async function renderPost({ id }) {
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
  $('#comment-cancel').onclick = closeForm;

  postStop.push(cloud.watchPost(
    id,
    (post) => {
      if (!document.body.contains(slot)) return;
      if (!post) {
        slot.innerHTML = '<p class="empty">この記録は削除されました。</p>';
        return;
      }
      // 下にコメント欄があるので、ここでは最新コメントを重ねて出さない
      slot.innerHTML = `<ul class="post-list">${postCard(post, { withLastComment: false, photoZoom: true })}</ul>`;
      restorePop(slot);
      const zoom = slot.querySelector('[data-zoom]');
      if (zoom) zoom.onclick = () => openPhoto(post.photo);
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

// ほかの人の図鑑やカレンダーは、その人が共有した記録から組み立てる。
// 相手の端末の中身は見られないので、見えるのは共有されたものだけ。
async function renderUser({ id }) {
  if (!me.user) {
    location.replace('#/feed');
    return;
  }

  app.innerHTML = header('プロフィール', { back: '#/feed', backLabel: 'みんなの記録' })
    + '<p class="empty">読み込んでいます…</p>';

  let profile = null;
  let posts = [];
  try {
    [profile, posts] = await Promise.all([cloud.getProfile(id), cloud.getPostsByUser(id)]);
  } catch (err) {
    console.error(err);
    app.innerHTML = header('プロフィール', { back: '#/feed', backLabel: 'みんなの記録' })
      + `<p class="empty">${esc(shareErrorMessage(err))}</p>`;
    return;
  }

  const isMe = id === me.user.uid;
  const name = profile?.nickname ?? '名無し';
  const bio = (profile?.bio ?? '').trim();
  const shopNames = new Set(posts.map((p) => p.shopName));
  // 公開設定。決めていない人は「見せる」扱いにする
  const showZukan = profile?.showZukan !== false;
  const showCalendar = profile?.showCalendar !== false;

  app.innerHTML = header(name, { back: '#/feed', backLabel: 'みんなの記録' }) + `
    <section class="user">
      <div class="user-head">
        <span class="user-avatar">${profile?.avatar
          ? `<img src="${profile.avatar}" alt="">`
          : esc(name.slice(0, 1))}</span>
        <div class="user-lines">
          <h2 class="user-name">${esc(name)}</h2>
          ${bio ? `<p class="user-bio">${esc(bio)}</p>` : ''}
        </div>
      </div>

      <dl class="shop-stats">
        <div><dt>共有</dt><dd>${posts.length}<small>杯</small></dd></div>
        <div><dt>お店</dt><dd>${shopNames.size}<small>店</small></dd></div>
        <div><dt>最高</dt><dd>${posts.length ? Math.max(...posts.map((p) => p.score)) : '–'}<small>点</small></dd></div>
      </dl>

      ${isMe ? '<a class="btn btn-ghost btn-block" href="#/account">プロフィールを編集</a>' : ''}

      ${showZukan ? `
        <h2 class="section-title">図鑑</h2>
        <div id="user-zukan"></div>` : ''}

      ${showCalendar ? `
        <h2 class="section-title">カレンダー</h2>
        <div id="user-cal"></div>` : ''}

      ${!showZukan && !showCalendar
        ? '<p class="empty">このユーザーは図鑑とカレンダーを公開していません。</p>'
        : ''}
    </section>`;

  if (showZukan) renderUserZukan($('#user-zukan'), posts);
  if (showCalendar) renderUserCalendar($('#user-cal'), posts);

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
    </section>`;

  navigator.storage?.estimate?.()
    .then(({ usage }) => {
      if (usage != null) $('#usage').textContent = `　使用容量 約${(usage / 1024 / 1024).toFixed(1)}MB`;
    })
    .catch(() => {});

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
          photo: await photoForShare(record.photoId),
        });
        await db.put('records', { ...record, postId });
        record.postId = postId;
        toast('みんなに共有しました');
      }
      renderEdit({ id: record.id }); // 表示を作り直す
    } catch (err) {
      console.error(err);
      alert(shareErrorMessage(err));
      btn.disabled = false;
    }
  };
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
  app.innerHTML = header('アカウント') + `<section class="account" id="account-slot">
    <p class="empty">確認しています…</p>
  </section>`;
  const slot = $('#account-slot');

  // ログイン状態を1回だけ確認する（画面はこのあと自分で作り直すので、以降の変化は見ない）
  let unsubscribe = () => {};
  let handled = false;
  unsubscribe = cloud.watchAuth(async (user) => {
    if (handled) return; // 2回目以降の通知は無視する
    handled = true;
    unsubscribe();
    if (!user) {
      renderLoginForm(slot);
      return;
    }
    let profile = null;
    try {
      profile = await cloud.getProfile(user.uid);
    } catch (err) {
      console.error(err);
    }
    renderProfileForm(slot, user, profile);
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

function renderProfileForm(slot, user, profile) {
  const avatarUrl = profile?.avatar ?? null;

  slot.innerHTML = `
    <p class="hint">${esc(user.email)} でログイン中</p>

    <form id="profile-form" novalidate>
      <div class="field">
        <span class="label">アイコン<small>（なくても登録できます）</small></span>
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
      </div>

      <div class="field">
        <label for="pf-name">ニックネーム</label>
        <input id="pf-name" type="text" maxlength="20" required value="${esc(profile?.nickname)}" placeholder="例：ほし">
      </div>

      <div class="field">
        <label for="pf-bio">一言紹介<small>（なくても登録できます）</small></label>
        <textarea id="pf-bio" rows="2" maxlength="60" placeholder="よろしくお願いします">${esc(profile?.bio)}</textarea>
      </div>

      <div class="field">
        <span class="label">公開する情報</span>
        <p class="hint">みんなの記録であなたのアイコンを押した人に、何を見せるかを決められます。見せるのは共有した記録だけで、端末の中の記録は公開されません。</p>
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
  { path: /^\/feed$/, view: renderFeed },
  { path: /^\/post\/([\w-]+)$/, view: renderPost },
  { path: /^\/user\/([\w@.-]+)$/, view: renderUser },
];

// 進んだのか戻ったのかを見分けるため、ホームからの遠さを数えておく
let lastDepth = 0;
let swipedBack = false; // スワイプで戻ってきたところかどうか

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
  app.classList.remove('page-in', 'page-back', 'page-slide-back');
  void app.offsetWidth; // 作り直して毎回動かす
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
});

enableSwipeBack(app); // 右スワイプでひとつ上の画面に戻れるようにする（登録は1回だけ）

window.addEventListener('hashchange', router);
router();

// オフラインでも開けるようにする仕組み（Service Worker）を登録
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker 登録失敗', err));
}
