<?php

session_start();
header('Content-Type: application/json; charset=utf-8');

// エラーハンドリング設定
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../php-error.log');

$config = require __DIR__ . '/../config.php';

try {
    // DB接続
    $dsn = "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // リクエスト取得
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    // ユーザーUUID取得
    $user_uuid = $_SERVER['HTTP_X_USER_ID'] ?? '';

    // CSRFトークン初期化
    if ($action === 'init_csrf') {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        echo json_encode(['token' => $_SESSION['csrf_token']]);
        exit;
    }

    // CSRFチェック
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid CSRF token']);
        exit;
    }

    // アクション分岐
    if ($action === 'get_posts') {
        $limit = isset($input['limit']) ? (int)$input['limit'] : 10;
        $offset = isset($input['offset']) ? (int)$input['offset'] : 0;

        // usersテーブルと結合して名前を取得
        $stmt = $pdo->prepare("SELECT p.id, u.name, p.body, p.user_uuid, p.created_at FROM posts p LEFT JOIN users u ON p.user_uuid = u.user_uuid ORDER BY p.created_at DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['posts' => $stmt->fetchAll()]);

    } elseif ($action === 'create_post') {
        if (empty($input['body']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        $stmt = $pdo->prepare("INSERT INTO posts (body, user_uuid) VALUES (?, ?)");
        $stmt->execute([
            $input['body'],
            $user_uuid
        ]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'delete_post') {
        if (empty($input['id']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        // 自身の投稿のみ削除可能
        $stmt = $pdo->prepare("DELETE FROM posts WHERE id = ? AND user_uuid = ?");
        $stmt->execute([$input['id'], $user_uuid]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid id or permission denied']);
        }

    } elseif ($action === 'get_user') {
        $stmt = $pdo->prepare("SELECT name FROM users WHERE user_uuid = ?");
        $stmt->execute([$user_uuid]);
        $user = $stmt->fetch();
        echo json_encode(['name' => $user['name'] ?? '']);

    } elseif ($action === 'update_user') {
        if (empty($input['name']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        // 名前を保存または更新
        $stmt = $pdo->prepare("INSERT INTO users (user_uuid, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)");
        $stmt->execute([$user_uuid, $input['name']]);
        echo json_encode(['success' => true]);

    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    // エラーログの詳細化
    $log_message = sprintf(
        "API Error [%s]: %s\nLocation: %s(%d)\nInput: %s\nTrace:\n%s",
        $action ?? 'unknown',
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        json_encode($input, JSON_UNESCAPED_UNICODE),
        $e->getTraceAsString()
    );
    error_log($log_message);
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
}