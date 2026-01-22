CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 既存の投稿からユーザー情報を移行（重複時は無視＝最初の1件が登録される）
INSERT IGNORE INTO users (user_uuid, name)
SELECT user_uuid, name FROM posts WHERE user_uuid != '';

-- postsテーブルからnameカラムを削除
ALTER TABLE posts DROP COLUMN name;