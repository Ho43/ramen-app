// =====================================================
// cloud.js — Firebase（ログイン・共有）とのやり取りをまとめたファイル
//
// この端末の中だけで完結する db.js とは別に、こちらはネットの先に
// あるFirebaseとやり取りする。ネットにつながっていない・許可された
// アカウントでない場合は、ここで投げられたエラーを呼び出し側が捕まえる。
//
// Firestoreの中身の作り：
//   users/{uid}                    … プロフィール
//   posts/{postId}                 … 共有された記録（guiltyUids に押した人のuid）
//   posts/{postId}/comments/{id}   … その記録へのコメント
// =====================================================

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  where,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

// ログイン状態が変わるたびに呼ばれる。戻り値を呼ぶと監視をやめられる。
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function signOutUser() {
  return firebaseSignOut(auth);
}

/* ---------- プロフィール ---------- */

export async function saveProfile(uid, profile) {
  await setDoc(doc(db, 'users', uid), profile, { merge: true });
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/* ---------- 共有された記録 ---------- */

// 投稿するときに、書いた人の名前とアイコンも一緒に入れておく。
// あとから名前を引きに行かずに一覧を描けるようにするため。
export async function sharePost(post) {
  const ref = await addDoc(collection(db, 'posts'), {
    ...post,
    guiltyUids: [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePost(id) {
  await deleteDoc(doc(db, 'posts', id));
}

export async function getPost(id) {
  const snap = await getDoc(doc(db, 'posts', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// みんなの記録を新しい順に流し込む。戻り値を呼ぶと購読をやめられる。
export function watchFeed(callback, onError) {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export function watchPost(id, callback, onError) {
  return onSnapshot(
    doc(db, 'posts', id),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError,
  );
}

/* ---------- ギルティ（いいね） ---------- */

// 押した人のuidを配列に足す・外すだけ。数はその配列の長さで分かる。
export function toggleGuilty(postId, uid, on) {
  return updateDoc(doc(db, 'posts', postId), {
    guiltyUids: on ? arrayUnion(uid) : arrayRemove(uid),
  });
}

/* ---------- コメント ---------- */

export function watchComments(postId, callback, onError) {
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(200));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export async function addComment(postId, comment) {
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    ...comment,
    guiltyUids: [],
    createdAt: serverTimestamp(),
  });
  // 一覧に件数と最新のコメントを出すため、投稿側にも書いておく。
  // 一覧を開くたびにコメントを読みに行かなくて済む。
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1),
    lastComment: { nickname: comment.nickname, avatar: comment.avatar ?? null, text: comment.text },
  });
}

export async function deleteComment(postId, commentId) {
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
  // 消したのが最新の1件だったときのために、残っている中の最新を入れ直す
  const rest = await getDocs(query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdAt', 'desc'),
    limit(1),
  ));
  const newest = rest.docs[0]?.data();
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(-1),
    lastComment: newest ? { nickname: newest.nickname, avatar: newest.avatar ?? null, text: newest.text } : null,
  });
}

// コメントにもギルティを付けられるようにする
export function toggleCommentGuilty(postId, commentId, uid, on) {
  return updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
    guiltyUids: on ? arrayUnion(uid) : arrayRemove(uid),
  });
}

/* ---------- ほかの人のページ ---------- */

// その人が共有した記録を集める。並べ替えは取ってきてからこちらで行う
// （日付での並べ替えまでFirestoreに任せると、別途索引の作成が必要になるため）
export async function getPostsByUser(uid) {
  const snap = await getDocs(query(collection(db, 'posts'), where('uid', '==', uid), limit(200)));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  posts.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return posts;
}
