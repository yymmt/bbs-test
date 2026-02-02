# Simple BBS

さくらのレンタルサーバ上で動作することを想定した、スレッド形式の掲示板システムです。
SPA (Single Page Application) 構成で、招待されたユーザーのみが閲覧可能なクローズドなコミュニティを構築できます。

## 機能概要

- **スレッド作成・管理**: スレッドを作成し、QRコードや招待リンクでメンバーを招待。
- **リアルタイム風投稿**: 投稿一覧の無限スクロール表示。
- **Web Push通知**: 新着投稿をプッシュ通知でお知らせ。
- **PWA対応**: スマートフォンのホーム画面に追加可能。
- **管理機能**: メンバー管理、スレッド名変更など。

## 技術スタック

- **Backend**: PHP 8.1+, MySQL 8.0
- **Frontend**: HTML/CSS/JavaScript (Vanilla JS)
- **Libraries**:
  - `minishlink/web-push` (PHP)
  - `ress.min.css`, `qrcode.js` (Frontend)

## デプロイ・セットアップ手順

### 1. 依存ライブラリのインストール
Composerを使用してPHPの依存ライブラリをインストールします。

```bash
composer install
```

### 2. 設定ファイルの作成
`config.php.example` をコピーして `config.php` を作成し、環境に合わせて編集してください。

```bash
cp config.php.example config.php
```

**Web Push通知の設定 (VAPIDキー)**
`config.php` 内の `web_push` 設定に必要なキーペアは、以下のコマンドで生成できます。

```bash
php -r "require 'vendor/autoload.php'; use Minishlink\WebPush\VAPID; var_dump(VAPID::createVapidKeys());"
```

### 3. データベースの準備
`config.php` に設定したデータベースに対して、マイグレーションを実行します。
ブラウザから `/admin/migrate.php` にアクセスして実行してください。

### 4. 管理画面のセキュリティ設定 (.htpasswd)
`/public/admin/` 配下は管理用ツールのため、BASIC認証で保護されています。
`.htpasswd` ファイルを作成し、ユーザーを登録してください。

```bash
# 例: adminユーザーを作成 (パスは絶対パスで指定)
htpasswd -c /path/to/your/project/public/admin/.htpasswd admin
```

また、`/public/admin/.htaccess` 内の `AuthUserFile` のパスを、作成した `.htpasswd` の**絶対パス**に書き換えてください。
