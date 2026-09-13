// =====================================================
// db.js — ブラウザ内のデータベース（IndexedDB）を扱うファイル
//
// 保存先は3つ（テーブルのようなもの）に分かれています。
//   shops   … お店（図鑑の1枠）       { id, name, createdAt }
//   records … 食べた記録（1杯ごと）   { id, shopId, menu, date, score, comment, photoId, createdAt, updatedAt }
//   photos  … 写真                    { id, blob }
// 写真は重いので記録とは別に保存し、必要なときだけ読み込みます。
// =====================================================

const DB_NAME = 'ramen-log';
const DB_VERSION = 1;
let dbPromise = null;

// データベースを開く（初回だけ保存先を作る）
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('shops')) {
          db.createObjectStore('shops', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('shopId', 'shopId');
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// 1回分の読み書き（トランザクション）を実行し、全部終わるまで待つ。
// 途中でエラーが起きると、そのトランザクション内の変更はすべて取り消される。
async function run(storeNames, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    work(tx, (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------- 基本の読み書き ----------

export function getAll(store) {
  return run(store, 'readonly', (tx, done) => {
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => done(req.result);
  });
}

export function get(store, id) {
  return run(store, 'readonly', (tx, done) => {
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => done(req.result);
  });
}

export function put(store, value) {
  return run(store, 'readwrite', (tx) => {
    tx.objectStore(store).put(value);
  });
}

// ---------- まとめて行う操作 ----------

// 記録を保存する（新しいお店・新しい写真・古い写真の削除も同時に）
export function saveRecord({ shop, record, newPhoto, oldPhotoId }) {
  return run(['shops', 'records', 'photos'], 'readwrite', (tx) => {
    if (shop) tx.objectStore('shops').put(shop);
    if (oldPhotoId) tx.objectStore('photos').delete(oldPhotoId);
    if (newPhoto) tx.objectStore('photos').put(newPhoto);
    tx.objectStore('records').put(record);
  });
}

// 記録を1件削除する（写真も一緒に）
export function deleteRecord(record) {
  return run(['records', 'photos'], 'readwrite', (tx) => {
    tx.objectStore('records').delete(record.id);
    if (record.photoId) tx.objectStore('photos').delete(record.photoId);
  });
}

// お店を削除する（そのお店の記録と写真も一緒に）
export function deleteShop(shopId, recordIds, photoIds) {
  return run(['shops', 'records', 'photos'], 'readwrite', (tx) => {
    tx.objectStore('shops').delete(shopId);
    recordIds.forEach((id) => tx.objectStore('records').delete(id));
    photoIds.forEach((id) => tx.objectStore('photos').delete(id));
  });
}

// すべてのデータを入れ替える（バックアップからの復元用）
export function replaceAll({ shops, records, photos }) {
  return run(['shops', 'records', 'photos'], 'readwrite', (tx) => {
    const shopStore = tx.objectStore('shops');
    const recordStore = tx.objectStore('records');
    const photoStore = tx.objectStore('photos');
    shopStore.clear();
    recordStore.clear();
    photoStore.clear();
    shops.forEach((s) => shopStore.put(s));
    records.forEach((r) => recordStore.put(r));
    photos.forEach((p) => photoStore.put(p));
  });
}
