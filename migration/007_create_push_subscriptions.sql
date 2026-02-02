CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL,
    endpoint TEXT NOT NULL,
    public_key VARCHAR(255) NOT NULL, -- p256dh
    auth_token VARCHAR(255) NOT NULL, -- auth
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_uuid, endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;