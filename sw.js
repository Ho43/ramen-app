// =====================================================
// sw.js — Service Worker（オフラインでもアプリを開けるようにする）
//
// 考え方：ネットにつながるときは最新のファイルを取りに行き、
// つながらないときは前に保存しておいたファイルを使う。
// ※ 記録データ（IndexedDB）はここでは扱いません。
//
// Firebaseの部品（認証・データベースの機能）だけは別扱い：
// Google側のサーバーにあるファイルで、中身がほぼ変わらないため、
// 一度読み込んだらそれを使い回し、毎回ダウンロードし直さないようにする。
// これによって、ログイン画面を開くたびに時間がかかるのを防ぐ。
// =====================================================

const CACHE_NAME = 'ramen-log-v29';
const FIREBASE_CACHE = 'ramen-log-firebase-v1';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './cloud.js',
  './firebase-config.js',
  './giruchiki.png',
  './avatar-bowl.png',
  './avatar-yolk.png',
  './badge-renge1.png',
  './badge-renge2.png',
  './badge-renge3.png',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((key) => key !== CACHE_NAME && key !== FIREBASE_CACHE)
        .map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isFirebase = request.url.startsWith('https://www.gstatic.com/firebasejs/');
  if (isFirebase) {
    // 一度取れたら、あとはずっとキャッシュを使う（先にキャッシュを見て、なければ取りに行く）
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(FIREBASE_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }))
    );
    return;
  }

  if (new URL(request.url).origin !== location.origin) return;

  // 更新の確認で読む sw.js はキャッシュに残さない。
  // 毎回ちがうURL（?t=…）で来るので、貯めても使い道がないため。
  if (new URL(request.url).pathname.endsWith('/sw.js')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
