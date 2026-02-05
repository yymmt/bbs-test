Gemini Code Assist 向けの指示テキストです。

- 仕様変更の指示時:
  1. まず ai_context.md のみを修正し、他ファイルは変更しないでください。
  2. ai_context.md の粒度より細かい仕様は、ai_context.md には書かずコンテキストとして記憶してください。
  3. 修正が必要なファイル一覧と、それらがコンテキストに含まれているか（編集可能か）を報告してください。ファイルの新規作成が必要な場合はファイル名を提案してください。
- 仕様変更のコード反映の指示時:
  - ai_context.md の内容に従い、対象ファイルを修正してください。
  - 後述の「キャッシュ対策」に従って、index.htmlとsw.jsの v も必要に応じてインクリメントしてください。
  - リファクタリングは積極的に行わないが、リファクタリングが強く推奨される場合は教えて下さい。(コードをすぐに修正するのではなく。)
- 微調整の指示時:
  - 指定したコード内に「微調整指示」とコメントがある場合、内容に応じて修正してください。リファクタリングやレイアウト修正を想定しています。指示が現実的でない、あるいは大きくデメリットがある場合はその旨返答してください。
- 方針の相談の時:
  - ai_context.mdもソースコードも修正しないようにしてください。
  - 相談内容に応じて、取りうる技術的な手段のバリエーションを提示したり、ソースコードの修正方針などを提示してください。（その場合も直ちにソースコードを修正するのではなく、上記「仕様変更の指示」「コード反映の指示」「微調整の指示」を待ってください。）
- 共通ルール:
  - Gemini Code Assist が生成したテキストを、こちらで手動修正している場合がありますので、必ず修正対象のファイル内容を読み込み直してから回答生成してください。

# プロジェクト概要
さくらのレンタルサーバ上で動作する、スレッド形式の掲示板システムの構築。
LINEのように、招待されたユーザーのみが閲覧可能なスレッドを作成し、コミュニケーションを行う（クローズドなコミュニティ）。
SPA (Single Page Application) 構成とする。

# 技術スタック
- PHP 8.1.29
- MySQL 8.0
- HTML/CSS/JavaScript (Vanilla JS)
- 外部ライブラリ:
  - CSSリセット: ress.min.css
  - Web Push (PHP): minishlink/web-push
  - フォント: Noto Sans JP (Google Fonts)
  - アイコン: Bootstrap Icons
  - QRコード生成: qrcode.js

# ディレクトリ構成
- /config.php
- /database.php
- /docs/
  - ai_context.md
- /migration/
- /public/
  - index.html
  - main.js
  - style.css
  - sw.js
  - manifest.json
  - api.php
  - images/
  - admin/
    - .htaccess
    - index.php
    - migrate.php
    - deploy.php
    - error_log.php

# 制約事項
- Laravel等のフレームワークや外部ライブラリは極力使用しない（標準関数中心で実装）。
- クライアント側もAngular等のフレームワークやjQueryなどのライブラリを使用しない（ただし、指定されたCSS/Fontライブラリは除く）。
- ソースコードへのコメント記述は最小限にする。

# 実装・セキュリティ方針
- データベース接続: PDOを使用し、プリペアドステートメントでSQLインジェクションを防ぐ。
- XSS対策: 出力時に必ずエスケープ処理を行う。
- エラーハンドリング: 画面に表示せずログファイルに記録する。
- コーディング規約:
  - PHP: PSR-12準拠。
  - HTML/CSS: Google HTML/CSS Style Guide準拠 (セマンティックなHTML, CSSはkebab-case等)。
  - JavaScript: Google JavaScript Style Guide準拠 (camelCase, const/let推奨)。
  - 共通: 変数名は具体的で分かりやすい英語名を使用。
- API設計: POSTメソッドのみ受け付け、ボディ内の action パラメータで処理を分岐させる。
- 設定管理: DB接続情報は /config.php に分離する。config.php はGit管理外とし、デプロイ先環境ごとに適切なファイルを配置する。ただし、サンプル用にconfig.php.exampleはGit管理する。
- CSRF対策: Synchronizer Token Patternを採用する（セッションとリクエストでトークン照合）。
- DB照合順序: 全テーブルで `utf8mb4_general_ci` に統一する。
- DB環境: 本番用とテスト用でデータベースを分ける。
- 認証方式: LocalStorageにUUID (v4) を保存し、リクエストヘッダー (X-USER-ID) で送信することでユーザーを識別する（簡易認証）。
  - 将来対応: 機種変更等に対応するため、引き継ぎコード発行・入力機能の実装を検討する。
- データキャッシュ: IndexedDBを使用し、投稿データ(posts)とユーザー情報(users)をクライアント側に永続化する。
  - 投稿データは本文(body)も含めて保存する。
  - 画面表示時はIndexedDBから即座に描画し、バックグラウンドでAPIから差分を取得して更新する。
- マイグレーション: SQLファイルを /migration/ に配置し、/admin/migrate.php で管理・実行する。
  - 注意: MySQLのDDLは暗黙的コミットを引き起こすため、マイグレーション実行時はPHP側でのトランザクション制御を行わない。
- マイグレーション管理: migrates テーブルを作成し、実行済みのSQLファイルは再実行しないように制御する。
- 管理ツール: /admin/ 配下に配置し、Basic認証(.htaccess)等でアクセス制限を行う。
- キャッシュ対策: `index.html` で読み込むCSS/JSファイルにはクエリパラメータ（例: `?v=1`）を付与し、変更時に値を更新することでブラウザキャッシュを回避する。
  - `manifest.json` にも同様にクエリパラメータを付与する。
  - `sw.js` 内の `CACHE_NAME` や `ASSETS` 内のパス（クエリパラメータ含む）も同様に更新し、PWAのキャッシュも更新されるようにする。
- SPAルーティング: History API (`pushState`, `popState`) を使用し、URLクエリパラメータ (`?thread_id=`) に基づいて画面遷移を制御する（Client-side Routing）。

# 機能要件 (要件定義)
- 初期設定 (Welcome画面): 初回アクセス時（UUID未保持）に表示。
  - ユーザー名登録: 名前を入力して利用開始する。
  - 引き継ぎ（将来対応）: 引き継ぎコードを入力し、既存のUUIDを設定する。
- スレッド一覧（ホーム）: 自身が参加しているスレッドを最終更新日時の降順で表示する。
  - スレッドが存在しない場合は、その旨を伝えるメッセージを表示する。
  - スレッド新規作成: スレッド名を入力して作成する（作成者は自動的に参加）。
- スレッド詳細（投稿一覧）: 選択したスレッドの投稿一覧を表示する。無限スクロール対応（スクロールで過去の投稿を読み込む）。
  - ヘッダーのページタイトルにスレッド名を表示する。
  - URLパラメータ `thread_id` がある場合、該当スレッドを直接開く。招待トークン `invite_token` がある場合は、スレッドに参加処理を行った後に開く。
  - 新規投稿: スレッド内にメッセージを投稿する。
  - 投稿メニュー: 各投稿に対する操作メニュー。
    - PC: 投稿ホバー時に「︙」アイコンを表示し、クリックでメニュー表示。
    - スマホ: 投稿長押しでメニュー表示。
    - メニュー内容: 投稿削除（自身の投稿のみ）。将来的に「いいね」等のスタンプ機能を追加予定。
    - 将来対応: 投稿編集機能の実装を検討中。postsテーブルのupdated_atカラムを用いて、クライアント側のキャッシュ更新判定を行う想定。
- 画面構成: SPA構成。ヘッダーには、戻るボタン（左上）、ページタイトル（中央）、ハンバーガーメニュー（右上）を配置。
  - 戻るボタンはスレッド詳細画面でのみ表示する。
  - ハンバーガーメニューで以下の画面を切り替える。スレッド詳細表示時には「Thread Settings」も表示する。
    - スレッド一覧画面（ホーム）
    - ユーザー設定画面
    - スレッド設定画面
- ユーザー設定: 自身の名前変更、引き継ぎコード発行（将来対応）など。ヘッダーのページタイトルに「User Settings」と表示する。アプリのバージョン情報を表示する。
- スレッド設定 (Thread Settings):
  - スレッド名の編集機能。
  - 参加メンバーの管理機能:
    - 参加者一覧を表示し、メンバーを除外できる（マイナスボタン）。
    - 招待可能なユーザー一覧（※）を表示し、メンバーを追加できる（プラスボタン）。
    - ※招待可能なユーザー: 自分が参加しているいずれかのスレッドに属しているが、現在のスレッドには未参加のユーザー。
  - 招待用QRコードの表示機能:
    - 一時的な招待トークンを含むURLを生成し、QRコードとして表示する。
    - 他のユーザーがQRコードをスキャンしてURLにアクセスすると、スレッドへの参加が完了する。
- 通知機能: スレッドに新着投稿があった際、参加している他のユーザーへWeb Push通知を送信する。
  - 通知クリック時、既存のウィンドウ（PWA含む）があればフォーカスして該当スレッドへ遷移し、なければ新規ウィンドウを開く。
- PWA対応: スマートフォンのホーム画面に追加可能にする（manifest.json, Service Worker）。
- 投稿削除: 自身の投稿のみ削除可能とする（UUIDで判定）。パスワード入力は不要。投稿メニューから実行する。

# 管理ツール仕様 (詳細設計)
- /admin/index.php: deploy.php, migrate.php へのリンクを表示。現在の状態として `git log -1` の結果を表示する。GitHubリンク（main/testコミット、比較）を表示する。git pullやマイグレーションが必要か判定し、不要な場合はリンクを無効化する。
- /admin/deploy.php: `git pull` を実行する。
- /admin/migrate.php: マイグレーションを実行する。style.cssを読み込み、管理パネルへの戻るリンクを表示する。
- /admin/error_log.php: php-error.log の内容を表示する。

# データベース設計 (詳細設計)
## posts テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- thread_id: INT NOT NULL
- user_uuid: VARCHAR(36) NOT NULL
- body: TEXT NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- FOREIGN KEY (thread_id) REFERENCES threads(id)

## threads テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- title: VARCHAR(100) NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

## thread_users テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- thread_id: INT NOT NULL
- user_uuid: VARCHAR(36) NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- UNIQUE(thread_id, user_uuid)

## thread_invites テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- thread_id: INT NOT NULL
- token: VARCHAR(32) NOT NULL UNIQUE
- expires_at: DATETIME NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE

## users テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- user_uuid: VARCHAR(36) NOT NULL UNIQUE
- name: VARCHAR(50) NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

## transfer_codes テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- user_uuid: VARCHAR(36) NOT NULL
- code: VARCHAR(20) NOT NULL
- expire_at: DATETIME NOT NULL
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP

## push_subscriptions テーブル
- id: INT AUTO_INCREMENT PRIMARY KEY
- user_uuid: VARCHAR(36) NOT NULL
- endpoint: TEXT NOT NULL
- public_key: VARCHAR(255) NOT NULL -- p256dh
- auth_token: VARCHAR(255) NOT NULL -- auth
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- UNIQUE(user_uuid, endpoint(255))

## migrates テーブル (マイグレーション管理)
- id: INT AUTO_INCREMENT PRIMARY KEY
- filename: VARCHAR(255) NOT NULL UNIQUE
- executed_at: DATETIME DEFAULT CURRENT_TIMESTAMP

## 作成済みマイグレーションファイル一覧
- 001_create_posts_table.sql
- 002_remove_password_from_posts.sql
- 003_add_user_uuid.sql
- 004_create_users_table.sql
- 005_fix_collation.sql
- 006_create_threads_and_transfer.sql
- 007_create_push_subscriptions.sql
- 008_create_thread_invites.sql
- 009_add_updated_at_to_posts.sql

# API仕様 (詳細設計)
- POST /api.php
  - リクエストヘッダー: `X-USER-ID` にUUIDを含める。
  - action=init_csrf: CSRFトークンを取得。
  - action=get_threads: 参加しているスレッド一覧を取得。
  - action=create_thread: 新規スレッド作成。title必須。
  - action=get_posts: 指定スレッドの投稿一覧を取得。thread_id, limit, before_id（過去ログ）, after_id（差分取得）パラメータ対応。
    - レスポンス: 投稿リスト(posts)と、それに関連するユーザー情報(users)を分離して返す（サイドローディング）。
  - action=get_thread_settings: `thread_id`必須。スレッド名、参加メンバー、招待可能メンバーの一覧を取得。
  - action=create_post: 指定スレッドに投稿。thread_id, body必須。
  - action=delete_post: 投稿削除。id必須。
  - action=get_user: 現在のユーザー情報を取得。
  - action=register_user: ユーザー登録（初回）。name必須。
  - action=update_user: ユーザー名を更新。name必須。
  - action=update_thread_title: スレッド名を更新。`thread_id`, `title`必須。
  - action=add_thread_member: メンバーをスレッドに追加。`thread_id`, `target_user_uuid`必須。
  - action=remove_thread_member: メンバーをスレッドから削除。`thread_id`, `target_user_uuid`必須。
  - action=generate_invite_token: `thread_id`必須。招待用トークンを生成して返す。
  - action=join_with_invite: `thread_id`, `token`必須。招待トークンを検証し、スレッドに参加する。
  - action=check_transfer_code: 引き継ぎコードを検証し、有効ならUUIDを返す。code必須。
  - action=register_subscription: Web Push通知の購読情報を登録。endpoint, keys[p256dh], keys[auth] 必須。
