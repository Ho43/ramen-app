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

const CACHE_NAME = 'ramen-log-v49';
const FIREBASE_CACHE = 'ramen-log-firebase-v1';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './cloud.js',
  './costumes.js',
  './firebase-config.js',
  './giruchiki.png',
  './avatar-bowl.png',
  './avatar-yolk.png',
  './badge-renge1.png',
  './badge-renge2.png',
  './badge-renge3.png',
  './badge-hashi1.png',
  './badge-hashi2.png',
  './badge-hashi3.png',
  './badge-don1.png',
  './badge-don2.png',
  './badge-don3.png',
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

// この Service Worker が動いている間に、すでに新しいか確かめたファイル
const checkedPaths = new Set();

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
  // 新しいファイルは裏で確かめて、変わっていればキャッシュを入れ替える（次に開いたときから新しくなる）。
  //
  // 通信量を減らすための工夫が2つある：
  //  ・確かめるときは cache: 'no-cache' を使う。これは「前と変わってる？」とサーバーに聞くだけで、
  //    変わっていなければ中身は送られてこない（304という短い返事だけ）。
  //    以前は 'no-store' で、変わっていなくても app.js や style.css を毎回まるごと取り直していた。
  //  ・同じファイルを確かめるのは、この Service Worker が動いている間に1回だけ。
  //    一覧にバッジ画像が何十個並んでも、確かめに行くのは1回で済む。
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const path = new URL(request.url).pathname;
      const fresh = () => fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      if (!cached) return fresh();
      if (!checkedPaths.has(path)) {
        checkedPaths.add(path);
        fresh().catch(() => {}); // 電波がないときは、キャッシュのままでいい
      }
      return cached;
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
  // イベントのお知らせはガチャ画面へ（そこで贈り物を受け取れる）
  const url = payload.type === 'event'
    ? './#/gacha'
    : payload.type === 'follow' && payload.uid
      ? `./#/user/${payload.uid}`
      : postId ? `./#/post/${postId}` : './#/feed';
  // すでにアプリが開いているときは、読み込み直さずに画面だけ切り替えてもらう。
  // （以前は client.navigate() でページごと読み込み直していたため、
  //   通知をタップしてから表示されるまでが遅かった）
  const hash = url.slice(url.indexOf('#'));
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'open', hash });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
