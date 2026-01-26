-- threads テーブル作成
CREATE TABLE IF NOT EXISTS threads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- デフォルトスレッド作成（既存データ移行用）
INSERT INTO threads (title) SELECT 'General' WHERE NOT EXISTS (SELECT 1 FROM threads);

-- thread_users テーブル作成
CREATE TABLE IF NOT EXISTS thread_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    user_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_id, user_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- transfer_codes テーブル作成
CREATE TABLE IF NOT EXISTS transfer_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL,
    code VARCHAR(20) NOT NULL,
    expire_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- posts テーブル変更
-- まずカラムを追加（デフォルト値を設定してエラー回避）
-- 既存のpostsがある場合、とりあえず最初のスレッド(General)に紐付ける
SET @default_thread_id = (SELECT id FROM threads ORDER BY id ASC LIMIT 1);

ALTER TABLE posts ADD COLUMN thread_id INT NOT NULL DEFAULT 0;

-- 既存データのthread_idを更新
UPDATE posts SET thread_id = @default_thread_id WHERE thread_id = 0;

-- 外部キー制約追加
ALTER TABLE posts ADD CONSTRAINT fk_posts_thread_id FOREIGN KEY (thread_id) REFERENCES threads(id);

-- 既存ユーザーをデフォルトスレッドに参加させる
INSERT IGNORE INTO thread_users (thread_id, user_uuid)
SELECT @default_thread_id, user_uuid FROM users;