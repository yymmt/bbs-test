-- posts テーブルに deleted_at カラムを追加（論理削除用）
ALTER TABLE posts ADD COLUMN deleted_at DATETIME DEFAULT NULL;