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

const CACHE_NAME = 'ramen-log-v39';
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

  // よく変わるファイル（コードや見た目）だけ、ブラウザのキャッシュも無視して必ず取りに行く。
  // 画像やアイコンはめったに変わらないので、今まで通りキャッシュに任せて速さを優先する
  const path = new URL(request.url).pathname;
  const alwaysFresh = /\.(html|js|css)$|\/$/.test(path);

  event.respondWith(
    fetch(request, alwaysFresh ? { cache: 'no-store' } : {})
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});

// =====================================================
// 通知（プッシュ通知）
//
// アプリを開いていないときに届く通知は、ここ（Service Worker）で受け取って
// 画面に表示する。開いているときは cloud.js 側の watchForegroundMessages() が
// 別に受け取るので、ここには来ない。
//
// classic worker（importなし）なので import ではなく importScripts を使う。
// firebase-config.js の中身（住所のようなもので、隠す必要はない）をここでも
// そのまま書いている。もしFirebaseプロジェクトの設定を変えたら、
// firebase-config.js と両方直すこと。
// =====================================================
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD3tP4D_EJlxvWVRD97aGHxbtM7TVZu7vg",
  authDomain: "maze-log-6ac46.firebaseapp.com",
  projectId: "maze-log-6ac46",
  storageBucket: "maze-log-6ac46.firebasestorage.app",
  messagingSenderId: "229867191911",
  appId: "1:229867191911:web:3f8e03ce98533b2fb95ec2",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'ラーメン記録';
  self.registration.showNotification(title, {
    body: payload.notification?.body ?? '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: payload.data ?? {},
  });
});

// 通知をタップしたら、アプリを開く（すでに開いていればそちらを前面に出す）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.postId
    ? `./#/post/${event.notification.data.postId}`
    : './#/feed';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
