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

// ホームでギルチキが話す一言を決める。
// 珍しい出来事ほど先に出し、当てはまらなければ点数に応じた一言を返す。
function chikiTalk(records, last) {
  if (!last) return '一杯目、待ってる。';

  const total = records.length;
  if (total === 100) return '100杯。おめでとう。';
  if (total === 50) return '50杯。数字がもう怖い。';
  if (total === 10) return '10杯突破。';

  const shopCount = records.filter((r) => r.shopId === last.shopId).length;
  if (shopCount === 10) return '10回目。もう家だろ。';
  if (shopCount === 5) return '常連だな。';
  if (shopCount === 3) return 'またここか。好きだな。';

  const streak = streakDays(records, last.date);
  if (streak >= 5) return 'もう生活だな。';
  if (streak >= 3) return `${streak}日続けて……ギルティ。`;

  const hour = new Date(last.createdAt).getHours();
  if (hour >= 2 && hour < 5) return 'もう朝じゃないか。';
  if (hour >= 22 || hour < 2) return 'こんな時間に……ギルティ。';
  if (hour >= 5 && hour < 10) return '朝から行ったのか。';

  if (shopCount === 1) return '新規開拓だな。';
  if (streak === 2) return '2日連続か。';
  return pick(TIER_TALK[faceTier(last.score)]);
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
  const recent = [...records].sort(byNewest).slice(0, 5);

  // ギルチキは最後に食べた一杯に反応する
  const last = recent[0];
  const talk = chikiTalk(records, last);
  const talkSub = last
    ? `${shopName(shopMap, last.shopId)}・${last.score}点`
    : '記録するボタンから始められる';

  app.innerHTML = `
    <section class="home">
      <h1 class="app-title">ラーメン記録</h1>
      <p class="summary">
        ${records.length
          ? `今月 ${monthCount}杯　通算 ${records.length}杯　${shops.length}店`
          : 'まだ記録がありません。最初の一杯を記録しましょう。'}
      </p>

      <div class="greet">
        ${mascot(last?.score ?? 50)}
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
      </nav>

      <h2 class="section-title">最近の記録</h2>
      ${recent.length
        ? `<ul class="rec-list">${recent.map((r) => recordRow(r, shopName(shopMap, r.shopId), r.menu)).join('')}</ul>`
        : '<p class="empty">記録するとここに表示されます。</p>'}

      <a class="text-link" href="#/settings">バックアップ・設定</a>
    </section>`;
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

      <a class="btn btn-primary btn-block" href="#/new?shop=${id}">このお店で記録する</a>

      <h2 class="section-title">食べた記録</h2>
      ${rows ? `<ul class="rec-list">${rows}</ul>` : '<p class="empty">記録がありません。</p>'}

      <div class="shop-actions">
        <button type="button" class="btn btn-ghost" id="rename-shop">店名を変更</button>
        <button type="button" class="btn btn-danger" id="delete-shop">お店を削除</button>
      </div>
    </section>`;

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
function monthCells(y, m, byDate, shopMap, today, selected) {
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
        ${list.slice(0, 2).map((r) => `<span class="cal-item">${esc(shopName(shopMap, r.shopId))}</span>`).join('')}
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
    return `<div class="cal-pane">${monthCells(d.getFullYear(), d.getMonth(), byDate, shopMap, today, cal.selected)}</div>`;
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

async function renderForm({ record = null, presetShopId = null, presetDate = null }) {
  const isEdit = Boolean(record);
  const { shops, records } = await loadAll();

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
  else if (shops.some((s) => s.id === presetShopId)) selectedShop = presetShopId;
  else if (!shops.length) selectedShop = '__new';

  const score = record?.score ?? 50;
  const date = record?.date ?? (/^\d{4}-\d{2}-\d{2}$/.test(presetDate ?? '') ? presetDate : todayStr());
  const currentPhotoUrl = record ? await getPhotoUrl(record.photoId) : null;

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
        <input id="f-newshop" type="text" placeholder="店名を入力" maxlength="50" autocomplete="off" hidden>
        <p class="hint" id="f-count"></p>
      </div>

      <div class="field">
        <label for="f-menu">食べたもの</label>
        <input id="f-menu" type="text" placeholder="例：特製醤油ラーメン" maxlength="60" autocomplete="off" value="${esc(record?.menu)}">
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
        <textarea id="f-comment" rows="3" maxlength="200" placeholder="その時感じたこと">${esc(record?.comment)}</textarea>
      </div>

      <p class="form-error" id="f-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" id="f-submit">${isEdit ? '変更を保存' : '記録する'}</button>
      ${isEdit ? '<button type="button" class="btn btn-danger btn-block" id="f-delete">この記録を削除</button>' : ''}
    </form>`;

  const shopSelect = $('#f-shop');
  const newShopInput = $('#f-newshop');
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
  }
  scoreRange.oninput = () => setScore(Number(scoreRange.value));
  app.querySelectorAll('[data-step]').forEach((btn) => {
    btn.onclick = () => setScore(Number(scoreRange.value) + Number(btn.dataset.step));
  });

  // --- 写真 ---
  // photoChange: undefined = 変更なし / null = 外す / Blob = 新しい写真
  let photoChange;
  let previewUrl = null;
  let sourceFile = null; // 切り抜き直せるよう、選んだ元の写真を覚えておく

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
  };

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
        shop = { id: newId(), name: newName, createdAt: Date.now() };
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

      const name = shop?.name ?? shops.find((s) => s.id === shopId)?.name;
      const nth = (counts.get(shopId) ?? 0) + 1;

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
      await db.deleteRecord(record);
      if (record.photoId) forgetPhotoUrl(record.photoId);
      toast('記録を削除しました');
      goBack();
    };
  }
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

/* ===================== 画面の切り替え ===================== */

const routes = [
  { path: /^\/$/, view: renderHome },
  { path: /^\/zukan$/, view: renderZukan },
  { path: /^\/calendar$/, view: renderCalendar },
  { path: /^\/shop\/([\w-]+)$/, view: renderShop },
  { path: /^\/new$/, view: renderNew },
  { path: /^\/edit\/([\w-]+)$/, view: renderEdit },
  { path: /^\/settings$/, view: renderSettings },
];

async function router() {
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
    window.scrollTo(0, 0);
    return;
  }
  location.replace('#/');
}

// 「戻る」ボタン（画面ごとに作り直されるので、親要素でまとめて受け取る）
app.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="back"]')) goBack();
});

window.addEventListener('hashchange', router);
router();

// オフラインでも開けるようにする仕組み（Service Worker）を登録
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker 登録失敗', err));
}
