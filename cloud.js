// =====================================================
// cloud.js — Firebase（ログイン・共有）とのやり取りをまとめたファイル
//
// この端末の中だけで完結する db.js とは別に、こちらはネットの先に
// あるFirebaseとやり取りする。ネットにつながっていない・許可された
// アカウントでない場合は、ここで投げられたエラーを呼び出し側が捕まえる。
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
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

// ログイン状態が変わるたびに呼ばれる。戻り値を呼ぶと監視をやめられる。
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
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

// --- プロフィール（users/そのuid） ---

export async function saveProfile(uid, profile) {
  await setDoc(doc(db, 'users', uid), profile, { merge: true });
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// --- 共有した記録（posts） ---

export async function sharePost(post) {
  const ref = await addDoc(collection(db, 'posts'), { ...post, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deletePost(id) {
  await deleteDoc(doc(db, 'posts', id));
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
