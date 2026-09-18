import { firebaseConfig } from './firebase-config.js';

// Firebaseの部品は「使うときになってから」読み込む。
// 以前はこのファイルの先頭で4つまとめて読み込んでいたため、
// ホーム・図鑑・カレンダーしか見ないときでも、起動のたびに
// データベースや通知の部品（特にデータベースは大きい）の
// 読み込みと準備が終わるのを待たされていた。
// 今は下の core() / store() / messaging() が最初に呼ばれたときだけ読み込み、
// 2回目からは同じものを使い回す。
const FB = 'https://www.gstatic.com/firebasejs/12.0.0/';

let corePromise = null;      // アプリ本体とログイン
let storePromise = null;     // データベース（Firestore）
let messagingPromise = null; // 通知（FCM）

// アプリ本体とログインの部品
function core() {
  if (!corePromise) {
    corePromise = (async () => {
      const [appMod, authMod] = await Promise.all([
        import(`${FB}firebase-app.js`),
        import(`${FB}firebase-auth.js`),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      return { app, auth: authMod.getAuth(app), a: authMod };
    })();
    // 失敗したときは覚えたままにせず、次に呼ばれたらもう一度試せるようにする
    corePromise.catch(() => { corePromise = null; });
  }
  return corePromise;
}

// データベースの部品
function store() {
  if (!storePromise) {
    storePromise = (async () => {
      const [{ app }, f] = await Promise.all([core(), import(`${FB}firebase-firestore.js`)]);
      return { db: f.getFirestore(app), f };
    })();
    storePromise.catch(() => { storePromise = null; });
  }
  return storePromise;
}

// 通知の部品
function messaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const [{ app }, m] = await Promise.all([core(), import(`${FB}firebase-messaging.js`)]);
      return { app, m };
    })();
    messagingPromise.catch(() => { messagingPromise = null; });
  }
  return messagingPromise;
}

// 見張り続ける系（onSnapshot・ログイン状態）を、読み込みを待たずに呼べるようにする。
// 戻り値はすぐ返る「やめるための関数」で、読み込みが終わる前にやめた場合も、
// 終わった時点ですぐ止める。
function lazyWatch(start, onError) {
  let stop = null;
  let stopped = false;
  start()
    .then((fn) => { if (stopped) fn(); else stop = fn; })
    .catch((err) => { console.error(err); onError?.(err); });
  return () => {
    stopped = true;
    stop?.();
    stop = null;
  };
}

// ログイン状態が変わるたびに呼ばれる。戻り値を呼ぶと監視をやめられる。
export function watchAuth(callback) {
  return lazyWatch(async () => {
    const { auth, a } = await core();
    return a.onAuthStateChanged(auth, callback);
  }, () => callback(null)); // 部品を読み込めないときは「ログインしていない」として扱う
}

export async function currentUser() {
  const { auth } = await core();
  return auth.currentUser;
}

export async function signUp(email, password) {
  const { auth, a } = await core();
  const cred = await a.createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signIn(email, password) {
  const { auth, a } = await core();
  const cred = await a.signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  const { auth, a } = await core();
  return a.signOut(auth);
}

/* ---------- プロフィール ---------- */

export async function saveProfile(uid, profile) {
  const { db, f } = await store();
  await f.setDoc(f.doc(db, 'users', uid), profile, { merge: true });
}

export async function getProfile(uid) {
  const { db, f } = await store();
  const snap = await f.getDoc(f.doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// 身内のメンバー一覧。「一緒に食べた人」を選ぶときに使う。
// users を読む許可はルール側ですでに身内全員に出ているので、
// 追加のルールは要らない（allow read は1件取得と一覧取得の両方を含む）。
export async function getMembers() {
  const { db, f } = await store();
  const snap = await f.getDocs(f.collection(db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* ---------- 共有された記録 ---------- */

// 投稿するときに、書いた人の名前とアイコンも一緒に入れておく。
// あとから名前を引きに行かずに一覧を描けるようにするため。
export async function sharePost(post) {
  const { db, f } = await store();
  const ref = await f.addDoc(f.collection(db, 'posts'), {
    ...post,
    guiltyUids: [],
    createdAt: f.serverTimestamp(),
  });
  return ref.id;
}

export async function deletePost(id) {
  const { db, f } = await store();
  await f.deleteDoc(f.doc(db, 'posts', id));
}

// 共有済みの記録を編集したときに、みんなの記録の側も書き換える。
// 投稿した人・投稿日時・ギルティ・コメント数は触らないので、
// 押されたギルティが消えたり、順番が入れ替わったりすることはない。
export async function updatePost(id, fields) {
  const { db, f } = await store();
  await f.updateDoc(f.doc(db, 'posts', id), fields);
}

export async function getPost(id) {
  const { db, f } = await store();
  const snap = await f.getDoc(f.doc(db, 'posts', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// みんなの記録を新しい順に流し込む。戻り値を呼ぶと購読をやめられる。
export function watchFeed(callback, onError) {
  return lazyWatch(async () => {
    const { db, f } = await store();
    const q = f.query(f.collection(db, 'posts'), f.orderBy('createdAt', 'desc'), f.limit(50));
    return f.onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError,
    );
  }, onError);
}

export function watchPost(id, callback, onError) {
  return lazyWatch(async () => {
    const { db, f } = await store();
    return f.onSnapshot(
      f.doc(db, 'posts', id),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      onError,
    );
  }, onError);
}

/* ---------- ギルティ（いいね） ---------- */

// 押した人のuidを配列に足す・外すだけ。数はその配列の長さで分かる。
export async function toggleGuilty(postId, uid, on) {
  const { db, f } = await store();
  return f.updateDoc(f.doc(db, 'posts', postId), {
    guiltyUids: on ? f.arrayUnion(uid) : f.arrayRemove(uid),
  });
}

/* ---------- コメント ---------- */

export function watchComments(postId, callback, onError) {
  return lazyWatch(async () => {
    const { db, f } = await store();
    const q = f.query(f.collection(db, 'posts', postId, 'comments'), f.orderBy('createdAt', 'asc'), f.limit(200));
    return f.onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError,
    );
  }, onError);
}

export async function addComment(postId, comment) {
  const { db, f } = await store();
  await f.addDoc(f.collection(db, 'posts', postId, 'comments'), {
    ...comment,
    guiltyUids: [],
    createdAt: f.serverTimestamp(),
  });
  // 一覧に件数と最新のコメントを出すため、投稿側にも書いておく。
  // 一覧を開くたびにコメントを読みに行かなくて済む。
  await f.updateDoc(f.doc(db, 'posts', postId), {
    commentCount: f.increment(1),
    lastComment: { uid: comment.uid, nickname: comment.nickname, avatar: comment.avatar ?? null, text: comment.text },
  });
}

export async function deleteComment(postId, commentId) {
  const { db, f } = await store();
  await f.deleteDoc(f.doc(db, 'posts', postId, 'comments', commentId));
  // 消したのが最新の1件だったときのために、残っている中の最新を入れ直す
  const rest = await f.getDocs(f.query(
    f.collection(db, 'posts', postId, 'comments'),
    f.orderBy('createdAt', 'desc'),
    f.limit(1),
  ));
  const newest = rest.docs[0]?.data();
  await f.updateDoc(f.doc(db, 'posts', postId), {
    commentCount: f.increment(-1),
    lastComment: newest ? { uid: newest.uid, nickname: newest.nickname, avatar: newest.avatar ?? null, text: newest.text } : null,
  });
}

// コメントにもギルティを付けられるようにする
export async function toggleCommentGuilty(postId, commentId, uid, on) {
  const { db, f } = await store();
  return f.updateDoc(f.doc(db, 'posts', postId, 'comments', commentId), {
    guiltyUids: on ? f.arrayUnion(uid) : f.arrayRemove(uid),
  });
}

// 未読の件数を数えるために、新しい投稿だけを取ってくる
export async function getRecentPosts(max = 30) {
  const { db, f } = await store();
  const snap = await f.getDocs(f.query(f.collection(db, 'posts'), f.orderBy('createdAt', 'desc'), f.limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------- ほかの人のページ ---------- */

// その人が共有した記録を集める。並べ替えは取ってきてからこちらで行う
// （日付での並べ替えまでFirestoreに任せると、別途索引の作成が必要になるため）
export async function getPostsByUser(uid) {
  const { db, f } = await store();
  const snap = await f.getDocs(f.query(f.collection(db, 'posts'), f.where('uid', '==', uid), f.limit(200)));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  posts.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return posts;
}

// その人が「一緒に食べた人」として名前を出された記録。
// 自分が共有したものではないので、getPostsByUser とは別に取る。
export async function getPostsTaggedWith(uid) {
  const { db, f } = await store();
  const snap = await f.getDocs(f.query(f.collection(db, 'posts'), f.where('withUids', 'array-contains', uid), f.limit(200)));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  posts.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return posts;
}

/* ---------- 通知（プッシュ通知） ---------- */

// この端末・このブラウザが通知に対応しているか。
// 対応していない環境（iPhoneでホーム画面に追加していないSafariタブなど）では
// 呼び出し側で通知の設定自体を隠す
export async function notificationsSupported() {
  try {
    const { m } = await messaging();
    return await m.isSupported();
  } catch {
    return false;
  }
}

// 通知を許可してもらい、この端末の宛先（トークン）を発行する。
// vapidKey は Firebaseコンソールで発行した公開鍵、swRegistration は
// すでに登録済みの Service Worker（sw.js）をそのまま渡す
export async function enableNotifications(vapidKey, swRegistration) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const { app, m } = await messaging();
  return m.getToken(m.getMessaging(app), { vapidKey, serviceWorkerRegistration: swRegistration });
}

// 発行した宛先を、自分のプロフィールに覚えておく（複数端末ぶん配列で持つ）
export async function saveFcmToken(uid, token) {
  const { db, f } = await store();
  await f.updateDoc(f.doc(db, 'users', uid), { fcmTokens: f.arrayUnion(token) });
}

export async function removeFcmToken(uid, token) {
  const { db, f } = await store();
  await f.updateDoc(f.doc(db, 'users', uid), { fcmTokens: f.arrayRemove(token) });
}

// アプリを開いている間（フォアグラウンド）に届いた通知はOSが自動表示しないので、
// 呼び出し側でトーストなど好きな見せ方をする
export function watchForegroundMessages(callback) {
  return lazyWatch(async () => {
    const { app, m } = await messaging();
    return m.onMessage(m.getMessaging(app), callback);
  });
}
