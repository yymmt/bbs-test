<?php
// このファイルはBasic認証(.htaccess)で保護されていることを想定しています。

// git pull が必要か判定
$repo_path = __DIR__ . '/../../';
$current_dir = getcwd();
chdir($repo_path);

$branch = trim(shell_exec('git branch --show-current 2>&1') ?? 'main');
// リモートの最新情報を取得 (通信が発生するため注意)
shell_exec('git fetch origin ' . $branch . ' 2>&1');
$local_hash = trim(shell_exec('git rev-parse HEAD 2>&1'));
$remote_hash = trim(shell_exec('git rev-parse origin/' . $branch . ' 2>&1'));
$is_pull_needed = ($local_hash !== $remote_hash);

chdir($current_dir);

// マイグレーションが必要か判定
require_once __DIR__ . '/../../database.php';
$is_migrate_needed = false;

try {
    $pdo = getPDO();
    
    // テーブルが存在しない、または未実行のファイルがあるか確認
    $stmt = $pdo->query("SHOW TABLES LIKE 'migrates'");
    if ($stmt->rowCount() === 0) {
        $is_migrate_needed = true;
    } else {
        $stmt = $pdo->query("SELECT filename FROM migrates");
        $executedFiles = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $files = glob(__DIR__ . '/../../migration/*.sql');
        foreach ($files as $file) {
            if (!in_array(basename($file), $executedFiles)) {
                $is_migrate_needed = true;
                break;
            }
        }
    }
} catch (Exception $e) {
    // DB接続エラー等の場合は念のため有効にしておくか、エラー表示する
    $is_migrate_needed = true;
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Admin Panel</title>
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <h1>管理パネル</h1>

    <h3>GitHub リンク</h3>
    <ul>
        <li><a href="https://github.com/yymmt/bbs-test/compare/main...test" target="_blank">main...testブランチの比較 (GitHub)</a></li>
    </ul>

    <h2>管理ツール</h2>
    <ul>
        <li>
            <?php if ($is_pull_needed): ?>
                <a href="deploy.php">デプロイ (git pull) - <strong>更新あり</strong></a>
            <?php else: ?>
                デプロイ (git pull) - 最新です
            <?php endif; ?>
        </li>
        <li>
            <?php if ($is_migrate_needed): ?>
                <a href="migrate.php">マイグレーション実行 - <strong>未実行あり</strong></a>
            <?php else: ?>
                マイグレーション実行 - 完了済み
            <?php endif; ?>
        </li>
        <li>
            <a href="php-error.log" target="_blank">エラーログ (php-error.log)</a>
        </li>
    </ul>
</body>
</html>