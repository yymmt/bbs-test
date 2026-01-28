<?php

require_once __DIR__ . '/../vendor/autoload.php';
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

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
        echo json_encode([
            'token' => $_SESSION['csrf_token'],
            'vapidPublicKey' => $config['web_push']['public_key'] ?? null
        ]);
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
        $thread_id = isset($input['thread_id']) ? (int)$input['thread_id'] : 0;
        $limit = isset($input['limit']) ? (int)$input['limit'] : 10;
        $offset = isset($input['offset']) ? (int)$input['offset'] : 0;

        if (empty($thread_id)) {
            throw new Exception('Thread ID is required');
        }

        // スレッドへのアクセス権確認
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied to this thread']);
            exit;
        }

        // usersテーブルと結合して名前を取得
        $stmt = $pdo->prepare("SELECT p.id, u.name, p.body, p.user_uuid, p.created_at FROM posts p LEFT JOIN users u ON p.user_uuid = u.user_uuid WHERE p.thread_id = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1, $thread_id, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->bindValue(3, $offset, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['posts' => $stmt->fetchAll()]);

    } elseif ($action === 'create_post') {
        if (empty($input['body']) || empty($input['thread_id']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        
        $thread_id = (int)$input['thread_id'];

        // スレッドへのアクセス権確認
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied to this thread']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO posts (thread_id, body, user_uuid) VALUES (?, ?, ?)");
        $stmt->execute([
            $thread_id,
            $input['body'],
            $user_uuid
        ]);

        // 通知送信処理
        if (isset($config['web_push'])) {
            // スレッド参加者（自分以外）の購読情報を取得
            $stmt = $pdo->prepare("
                SELECT ps.endpoint, ps.public_key, ps.auth_token 
                FROM thread_users tu
                JOIN push_subscriptions ps ON tu.user_uuid = ps.user_uuid
                WHERE tu.thread_id = ? AND tu.user_uuid != ?
            ");
            $stmt->execute([$thread_id, $user_uuid]);
            $subscriptions = $stmt->fetchAll();

            if ($subscriptions) {
                $auth = [
                    'VAPID' => [
                        'subject' => $config['web_push']['subject'],
                        'publicKey' => $config['web_push']['public_key'],
                        'privateKey' => $config['web_push']['private_key'],
                    ],
                ];
                $webPush = new WebPush($auth);

                // スレッドタイトル取得
                $stmt = $pdo->prepare("SELECT title FROM threads WHERE id = ?");
                $stmt->execute([$thread_id]);
                $threadTitle = $stmt->fetchColumn();

                $payload = json_encode([
                    'title' => "New post in {$threadTitle}",
                    'body' => mb_substr($input['body'], 0, 50) . (mb_strlen($input['body']) > 50 ? '...' : ''),
                    'url' => "./?thread_id={$thread_id}",
                    'icon' => 'images/icons/icon-192x192.png'
                ]);

                foreach ($subscriptions as $sub) {
                    $subscription = Subscription::create([
                        'endpoint' => $sub['endpoint'],
                        'publicKey' => $sub['public_key'],
                        'authToken' => $sub['auth_token'],
                    ]);
                    $webPush->queueNotification($subscription, $payload);
                }
                $webPush->flush();
            }
        }

        echo json_encode(['success' => true]);

    } elseif ($action === 'get_threads') {
        // 自分が参加しているスレッド一覧を取得（最終更新日時順）
        // threadsテーブルのupdated_atを利用
        $stmt = $pdo->prepare("
            SELECT t.id, t.title, t.updated_at 
            FROM threads t 
            JOIN thread_users tu ON t.id = tu.thread_id 
            WHERE tu.user_uuid = ? 
            ORDER BY t.updated_at DESC
        ");
        $stmt->execute([$user_uuid]);
        echo json_encode(['threads' => $stmt->fetchAll()]);

    } elseif ($action === 'create_thread') {
        if (empty($input['title']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        $pdo->beginTransaction();
        try {
            // スレッド作成
            $stmt = $pdo->prepare("INSERT INTO threads (title) VALUES (?)");
            $stmt->execute([$input['title']]);
            $thread_id = $pdo->lastInsertId();

            // 作成者を参加させる
            $stmt = $pdo->prepare("INSERT INTO thread_users (thread_id, user_uuid) VALUES (?, ?)");
            $stmt->execute([$thread_id, $user_uuid]);

            $pdo->commit();
            echo json_encode(['success' => true, 'thread_id' => $thread_id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            throw $e;
        }

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

    } elseif ($action === 'register_user') {
        if (empty($input['name']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        // 新規登録（UUIDが重複していたらエラーになるが、クライアント側で制御想定）
        $stmt = $pdo->prepare("INSERT INTO users (user_uuid, name) VALUES (?, ?)");
        $stmt->execute([$user_uuid, $input['name']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'update_user') {
        if (empty($input['name']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        // 名前を保存または更新
        $stmt = $pdo->prepare("INSERT INTO users (user_uuid, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)");
        $stmt->execute([$user_uuid, $input['name']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'check_transfer_code') {
        if (empty($input['code'])) {
            throw new Exception('Code is required');
        }
        $stmt = $pdo->prepare("SELECT user_uuid FROM transfer_codes WHERE code = ? AND expire_at > NOW()");
        $stmt->execute([$input['code']]);
        $result = $stmt->fetch();
        if ($result) {
            echo json_encode(['success' => true, 'user_uuid' => $result['user_uuid']]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid or expired code']);
        }

    } elseif ($action === 'register_subscription') {
        if (empty($input['endpoint']) || empty($input['keys']['p256dh']) || empty($input['keys']['auth']) || empty($user_uuid)) {
            throw new Exception('Missing required fields');
        }
        $stmt = $pdo->prepare("
            INSERT INTO push_subscriptions (user_uuid, endpoint, public_key, auth_token) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), auth_token = VALUES(auth_token)
        ");
        $stmt->execute([$user_uuid, $input['endpoint'], $input['keys']['p256dh'], $input['keys']['auth']]);
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