<?php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../database.php';
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

session_start();
header('Content-Type: application/json; charset=utf-8');

// エラーハンドリング設定
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../php-error.log');

$config = require __DIR__ . '/../config.php';

const AI_USER_UUID = 'ai-assistant-0000-0000-0000-00000000';

try {
    // DB接続
    $pdo = getPDO();

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
        echo json_encode(['error' => 'error_invalid_csrf_token']);
        exit;
    }

    // アクション分岐
    if ($action === 'get_posts') {
        $thread_id = isset($input['thread_id']) ? (int)$input['thread_id'] : 0;
        $limit = isset($input['limit']) ? (int)$input['limit'] : 10;
        $before_id = isset($input['before_id']) ? (int)$input['before_id'] : 0;
        $after_id = isset($input['after_id']) ? (int)$input['after_id'] : 0;

        if (empty($thread_id)) {
            throw new Exception('error_thread_id_required');
        }

        // スレッドへのアクセス権確認
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'error_access_denied']);
            exit;
        }

        // usersテーブルとのJOINを廃止し、postsのみ取得
        $sql = "SELECT id, thread_id, user_uuid, body, created_at FROM posts WHERE thread_id = :thread_id AND deleted_at IS NULL";
        if ($before_id > 0) {
            $sql .= " AND id < :before_id";
        }
        if ($after_id > 0) {
            $sql .= " AND id > :after_id";
        }
        $sql .= " ORDER BY id DESC LIMIT :limit";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':thread_id', $thread_id, PDO::PARAM_INT);
        if ($before_id > 0) {
            $stmt->bindValue(':before_id', $before_id, PDO::PARAM_INT);
        }
        if ($after_id > 0) {
            $stmt->bindValue(':after_id', $after_id, PDO::PARAM_INT);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $posts = $stmt->fetchAll();

        // 関連するユーザー情報を取得 (サイドローディング)
        $users = [];
        if (!empty($posts)) {
            $userIds = array_unique(array_column($posts, 'user_uuid'));
            if (!empty($userIds)) {
                $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                $stmt = $pdo->prepare("SELECT user_uuid, name FROM users WHERE user_uuid IN ($placeholders)");
                $stmt->execute(array_values($userIds));
                $users = $stmt->fetchAll();
            }
        }

        echo json_encode(['posts' => $posts, 'users' => $users]);

    } elseif ($action === 'create_post') {
        if (empty($input['body']) || empty($input['thread_id']) || empty($user_uuid)) {
            throw new Exception('error_missing_fields');
        }
        
        $thread_id = (int)$input['thread_id'];

        // スレッドへのアクセス権確認
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'error_access_denied']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO posts (thread_id, body, user_uuid) VALUES (?, ?, ?)");
        $stmt->execute([
            $thread_id,
            $input['body'],
            $user_uuid
        ]);

        $new_post_id = $pdo->lastInsertId();

        // 通知送信処理
        sendWebPush($pdo, $config, $thread_id, $user_uuid, function() use ($pdo, $thread_id, $new_post_id, $input) {
            // スレッドタイトル取得
            $stmt = $pdo->prepare("SELECT title FROM threads WHERE id = ?");
            $stmt->execute([$thread_id]);
            $threadTitle = $stmt->fetchColumn();

            return json_encode([
                'type' => 'create',
                'thread_id' => $thread_id,
                'post_id' => $new_post_id,
                'title' => "New post in {$threadTitle}",
                'body' => mb_substr($input['body'], 0, 50) . (mb_strlen($input['body']) > 50 ? '...' : ''),
                'url' => "index.html?thread_id={$thread_id}",
                'icon' => 'images/icons/icon.png'
            ]);
        });

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
            throw new Exception('error_missing_fields');
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
            throw new Exception('error_missing_fields');
        }
        
        // 投稿の存在確認とthread_id取得（自身の投稿であることも確認）
        $stmt = $pdo->prepare("SELECT thread_id FROM posts WHERE id = ? AND user_uuid = ?");
        $stmt->execute([$input['id'], $user_uuid]);
        $post = $stmt->fetch();
        
        if (!$post) {
            http_response_code(400);
            echo json_encode(['error' => 'error_invalid_id_or_permission']);
            exit;
        }
        
        $thread_id = $post['thread_id'];

        // 論理削除
        $stmt = $pdo->prepare("UPDATE posts SET deleted_at = NOW() WHERE id = ?");
        $stmt->execute([$input['id']]);
        
        // 通知送信処理
        sendWebPush($pdo, $config, $thread_id, $user_uuid, function() use ($thread_id, $input) {
            return json_encode([
                'type' => 'delete',
                'thread_id' => $thread_id,
                'post_id' => $input['id'],
            ]);
        });

        echo json_encode(['success' => true]);
    } elseif ($action === 'get_user') {
        $stmt = $pdo->prepare("SELECT name FROM users WHERE user_uuid = ?");
        $stmt->execute([$user_uuid]);
        $user = $stmt->fetch();
        echo json_encode(['name' => $user['name'] ?? '']);

    } elseif ($action === 'register_user') {
        if (empty($input['name']) || empty($user_uuid)) {
            throw new Exception('error_missing_fields');
        }
        // 新規登録（UUIDが重複していたらエラーになるが、クライアント側で制御想定）
        $stmt = $pdo->prepare("INSERT INTO users (user_uuid, name) VALUES (?, ?)");
        $stmt->execute([$user_uuid, $input['name']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'update_user') {
        if (empty($input['name']) || empty($user_uuid)) {
            throw new Exception('error_missing_fields');
        }
        // 名前を保存または更新
        $stmt = $pdo->prepare("INSERT INTO users (user_uuid, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)");
        $stmt->execute([$user_uuid, $input['name']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'generate_transfer_code') {
        if (empty($user_uuid)) {
            throw new Exception('error_user_uuid_required');
        }
        // 数字6桁のコード生成
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expire_at = date('Y-m-d H:i:s', strtotime('+10 minutes')); // 10分間有効

        $stmt = $pdo->prepare("INSERT INTO transfer_codes (user_uuid, code, expire_at) VALUES (?, ?, ?)");
        $stmt->execute([$user_uuid, $code, $expire_at]);

        echo json_encode(['success' => true, 'code' => $code, 'expire_at' => $expire_at]);

    } elseif ($action === 'check_transfer_code') {
        if (empty($input['code'])) {
            throw new Exception('error_code_required');
        }
        $stmt = $pdo->prepare("SELECT user_uuid FROM transfer_codes WHERE code = ? AND expire_at > NOW()");
        $stmt->execute([$input['code']]);
        $result = $stmt->fetch();
        if ($result) {
            echo json_encode(['success' => true, 'user_uuid' => $result['user_uuid']]);
        } else {
            echo json_encode(['success' => false, 'error' => 'error_invalid_code']);
        }

    } elseif ($action === 'register_subscription') {
        if (empty($input['endpoint']) || empty($input['keys']['p256dh']) || empty($input['keys']['auth']) || empty($user_uuid)) {
            throw new Exception('error_missing_fields');
        }
        $stmt = $pdo->prepare("
            INSERT INTO push_subscriptions (user_uuid, endpoint, public_key, auth_token) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), auth_token = VALUES(auth_token)
        ");
        $stmt->execute([$user_uuid, $input['endpoint'], $input['keys']['p256dh'], $input['keys']['auth']]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'get_thread_settings') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        if (empty($thread_id)) throw new Exception('error_thread_id_required');

        // スレッド情報
        $stmt = $pdo->prepare("SELECT title FROM threads WHERE id = ?");
        $stmt->execute([$thread_id]);
        $thread = $stmt->fetch();
        if (!$thread) throw new Exception('error_thread_not_found');

        // 参加メンバー
        $stmt = $pdo->prepare("SELECT u.user_uuid, u.name FROM thread_users tu JOIN users u ON tu.user_uuid = u.user_uuid WHERE tu.thread_id = ?");
        $stmt->execute([$thread_id]);
        $members = $stmt->fetchAll();

        // 招待候補（自分が参加している他のスレッドにいるが、このスレッドにはいないユーザー）
        $stmt = $pdo->prepare("
            SELECT DISTINCT u.user_uuid, u.name
            FROM users u
            JOIN thread_users tu_other ON u.user_uuid = tu_other.user_uuid
            WHERE tu_other.thread_id IN (
                SELECT thread_id FROM thread_users WHERE user_uuid = ?
            )
            AND u.user_uuid NOT IN (
                SELECT user_uuid FROM thread_users WHERE thread_id = ?
            )
        ");
        $stmt->execute([$user_uuid, $thread_id]);
        $candidates = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'title' => $thread['title'],
            'members' => $members,
            'candidates' => $candidates
        ]);

    } elseif ($action === 'update_thread_title') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        if (empty($thread_id) || empty($input['title'])) throw new Exception('error_invalid_input');

        // 権限チェック（参加者ならOK）
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) throw new Exception('error_permission_denied');

        $stmt = $pdo->prepare("UPDATE threads SET title = ? WHERE id = ?");
        $stmt->execute([$input['title'], $thread_id]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'add_thread_member') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        $target_uuid = $input['target_user_uuid'] ?? '';
        if (empty($thread_id) || empty($target_uuid)) throw new Exception('error_invalid_input');

        // 権限チェック
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) throw new Exception('error_permission_denied');

        $stmt = $pdo->prepare("INSERT IGNORE INTO thread_users (thread_id, user_uuid) VALUES (?, ?)");
        $stmt->execute([$thread_id, $target_uuid]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'remove_thread_member') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        $target_uuid = $input['target_user_uuid'] ?? '';
        if (empty($thread_id) || empty($target_uuid)) throw new Exception('error_invalid_input');

        // 権限チェック
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) throw new Exception('error_permission_denied');

        $stmt = $pdo->prepare("DELETE FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $target_uuid]);
        echo json_encode(['success' => true]);

    } elseif ($action === 'generate_invite_token') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        if (empty($thread_id)) throw new Exception('error_thread_id_required');

        $token = bin2hex(random_bytes(16));
        $expires_at = date('Y-m-d H:i:s', strtotime('+24 hours'));

        $stmt = $pdo->prepare("INSERT INTO thread_invites (thread_id, token, expires_at) VALUES (?, ?, ?)");
        $stmt->execute([$thread_id, $token, $expires_at]);
        echo json_encode(['success' => true, 'token' => $token]);

    } elseif ($action === 'join_with_invite') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        $token = $input['token'] ?? '';
        if (empty($thread_id) || empty($token)) throw new Exception('error_invalid_input');

        $stmt = $pdo->prepare("SELECT 1 FROM thread_invites WHERE thread_id = ? AND token = ? AND expires_at > NOW()");
        $stmt->execute([$thread_id, $token]);
        if ($stmt->fetch()) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO thread_users (thread_id, user_uuid) VALUES (?, ?)");
            $stmt->execute([$thread_id, $user_uuid]);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'error_invalid_token']);
        }

    } elseif ($action === 'summarize_thread') {
        $thread_id = (int)($input['thread_id'] ?? 0);
        if (empty($thread_id)) throw new Exception('error_thread_id_required');

        // 権限チェック
        $stmt = $pdo->prepare("SELECT 1 FROM thread_users WHERE thread_id = ? AND user_uuid = ?");
        $stmt->execute([$thread_id, $user_uuid]);
        if (!$stmt->fetch()) throw new Exception('error_permission_denied');

        // 直近の投稿を取得 (10件)
        $stmt = $pdo->prepare("
            SELECT p.body, u.name 
            FROM posts p 
            JOIN users u ON p.user_uuid = u.user_uuid 
            WHERE p.thread_id = ? AND p.deleted_at IS NULL 
            ORDER BY p.id DESC LIMIT 10
        ");
        $stmt->execute([$thread_id]);
        $posts = array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC)); // 古い順にする

        if (empty($posts)) {
            throw new Exception('error_invalid_input'); // 投稿がない場合はエラー扱い
        }

        // プロンプト作成
        $prompt = "以下のチャットログを要約してください。\n\n";
        foreach ($posts as $post) {
            $prompt .= "{$post['name']}: {$post['body']}\n";
        }

        // Gemini API 呼び出し
        $apiKey = $config['gemini']['api_key'] ?? '';
        if (empty($apiKey)) throw new Exception('error_internal_server_error'); // APIキー未設定

        $api_url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
        $data = [
            "contents" => [
                ["parts" => [["text" => $prompt]]]
            ]
        ];

        $ch = curl_init($api_url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-goog-api-key: ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            error_log('Curl error: ' . curl_error($ch));
            curl_close($ch);
            throw new Exception('error_internal_server_error');
        }
        curl_close($ch);

        $result = json_decode($response, true);
        $aiText = $result['candidates'][0]['content']['parts'][0]['text'] ?? '要約に失敗しました。';

        // AIユーザーとして投稿
        $stmt = $pdo->prepare("INSERT INTO posts (thread_id, body, user_uuid) VALUES (?, ?, ?)");
        $stmt->execute([$thread_id, $aiText, AI_USER_UUID]);
        $new_post_id = $pdo->lastInsertId();

        // 通知は create_post と同様のロジックが必要だが、ここでは簡略化のため省略するか、共通関数を呼ぶ
        // AIの投稿も通知対象とする
        sendWebPush($pdo, $config, $thread_id, AI_USER_UUID, function() use ($pdo, $thread_id, $new_post_id, $aiText) {
            $stmt = $pdo->prepare("SELECT title FROM threads WHERE id = ?");
            $stmt->execute([$thread_id]);
            $threadTitle = $stmt->fetchColumn();
            return json_encode([
                'type' => 'create',
                'thread_id' => $thread_id,
                'post_id' => $new_post_id,
                'title' => "AI Summary in {$threadTitle}",
                'body' => mb_substr($aiText, 0, 50) . '...',
                'url' => "index.html?thread_id={$thread_id}",
                'icon' => 'images/icons/icon.png'
            ]);
        });

        echo json_encode(['success' => true]);

    } else {
        http_response_code(400);
        echo json_encode(['error' => 'error_invalid_action']);
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
    echo json_encode(['error' => 'error_internal_server_error']);
}

/**
 * Web Push通知を送信する共通関数
 */
function sendWebPush(PDO $pdo, array $config, int $thread_id, string $user_uuid, callable $payloadBuilder)
{
    if (!isset($config['web_push'])) {
        return;
    }

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

        $payload = $payloadBuilder();

        foreach ($subscriptions as $sub) {
            $subscription = Subscription::create([
                'endpoint' => $sub['endpoint'],
                'publicKey' => $sub['public_key'],
                'authToken' => $sub['auth_token'],
            ]);
            $webPush->queueNotification($subscription, $payload);
        }
        
        $report = $webPush->flush();
        
        foreach ($report as $result) {
            if (!$result->isSuccess() && $result->isSubscriptionExpired()) {
                $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
                $stmt->execute([$result->getEndpoint()]);
            }
        }
    }
}