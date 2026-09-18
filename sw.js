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

const CACHE_NAME = 'ramen-log-v41';
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

  // まずキャッシュにあるものを返して、すぐ画面を出す。
  // 新しいファイルは裏で取り直してキャッシュを入れ替えるので、次に開いたときから新しくなる。
  // （以前はコード・見た目を毎回ネットから取り直していたため、電波が弱いと
  //   起動のたびにその待ち時間が発生していた。更新に気づく仕組みは、
  //   起動時の帯と設定の「アプリの更新」が別に持っているので、これで困らない）
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const path = new URL(request.url).pathname;
      const alwaysFresh = /\.(html|js|css)$|\/$/.test(path);
      const fresh = fetch(request, alwaysFresh ? { cache: 'no-store' } : {})
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      // キャッシュがあればそれを返し、取り直しは裏で進める
      return cached || fresh;
    })
  );
});

// =====================================================
// 通知（プッシュ通知）
//
// 表示そのものは Firebase のSDKに任せている。
// 送られてくるデータに notification（タイトルと本文）が入っていると、
// SDKが自動で画面に出してくれるため、ここで自分でも showNotification() を
// 呼んでしまうと、1件の通知が2つ表示されてしまう。
// なので、ここでやるのは「タップされたときにどこを開くか」だけ。
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

// SDKに通知の受け取り口を用意させる。表示はSDKが自動で行うので、
// ここでは onBackgroundMessage を使わない（使うと二重表示になる）
firebase.messaging();

// 通知をタップしたら、アプリを開く（すでに開いていればそちらを前面に出す）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const payload = data.FCM_MSG?.data ?? data;
  const postId = data.postId ?? payload.postId;
  // フォローの通知はフォローしてくれた人のプロフィールへ
  const url = payload.type === 'follow' && payload.uid
    ? `./#/user/${payload.uid}`
    : postId ? `./#/post/${postId}` : './#/feed';
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
