# ラーメン記録

食べたラーメンを記録する、iPhone向けのWebアプリ（PWA）です。
HTML / CSS / JavaScript だけで作っているので、ビルドやインストールは不要です。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | アプリの入り口 |
| `style.css` | 見た目 |
| `app.js` | 画面の表示と操作（ホーム・図鑑・カレンダー・記録・設定） |
| `db.js` | データの保存（ブラウザ内のデータベース IndexedDB） |
| `sw.js` | オフラインでも開けるようにする仕組み（Service Worker） |
| `manifest.json` | ホーム画面に追加したときの名前やアイコン |
| `icons/` | アプリのアイコン |

## パソコンで動かしてみる

`index.html` をダブルクリックして開くだけでは動きません（`app.js` の読み込み方式の関係）。
次のどちらかで開いてください。

**方法A：VS Code を使う（おすすめ）**
1. VS Code で `ramen-app` フォルダを開く
2. 拡張機能「Live Server」をインストール
3. `index.html` を右クリック →「Open with Live Server」

**方法B：Python を使う**
```
cd ramen-app
python -m http.server 8000
```
ブラウザで `http://localhost:8000` を開く。

※ Chrome の開発者ツール（F12）→ 左上のスマホアイコンで、iPhoneサイズの表示を確認できます。

## iPhoneで使えるようにする（GitHub Pages・無料）

1. [GitHub](https://github.com) でアカウントを作る
2. 右上「+」→「New repository」で新しいリポジトリを作る（Public を選ぶ）
3. 「Add file」→「Upload files」で、このフォルダの中身をすべてアップロード（`icons` フォルダも）
4. リポジトリの「Settings」→「Pages」→ Branch を `main`、フォルダを `/(root)` にして「Save」
5. 数分待つと `https://ユーザー名.github.io/リポジトリ名/` で開けるようになる

※ 公開されるのはアプリのプログラムだけです。記録したデータはiPhoneの中にだけ保存され、アップロードされることはありません。

## iPhoneのホーム画面に追加する

1. iPhone の **Safari** で上のURLを開く
2. 共有ボタン（□に↑）→「ホーム画面に追加」
3. 以降は **必ずホーム画面のアイコンから** 使う

> Safari のタブで記録したデータと、ホーム画面のアプリのデータは別々に保存されます。
> 記録はホーム画面のアイコンから始めてください。

## アプリを更新したとき

1. 変更したファイルを GitHub に上書きアップロード
2. `sw.js` の `CACHE_NAME` の数字を上げる（例：`ramen-log-v1` → `ramen-log-v2`）
3. iPhone でアプリを一度完全に閉じてから開き直す（反映まで2回ほど開き直すことがあります）

## データについての注意

- 記録はiPhoneの中にだけ保存されます
- ホーム画面のアイコンを削除すると、記録も一緒に消えます
- 機種変更に備えて、ホームの「バックアップ・設定」からときどき書き出してください
  （共有シートで「"ファイル"に保存」を選ぶと iCloud Drive などに保存できます）
