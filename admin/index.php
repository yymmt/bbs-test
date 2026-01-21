<?php
// このファイルはBasic認証(.htaccess)で保護されていることを想定しています。

// git log を実行し、最新のコミット情報を取得
$git_log = shell_exec('git log -1 --pretty=format:"%h - %an, %ar : %s"');
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

    <h2>現在の状態</h2>
    <p>最新のコミット:</p>
    <pre><?php echo htmlspecialchars($git_log ?: 'Gitリポジトリが見つからないか、コミットがありません。', ENT_QUOTES, 'UTF-8'); ?></pre>

    <h3>GitHub リンク</h3>
    <ul>
        <li><a href="https://github.com/yymmt/bbs-test/commits/main/" target="_blank">mainブランチのコミット</a></li>
        <li><a href="https://github.com/yymmt/bbs-test/commits/test/" target="_blank">testブランチのコミット</a></li>
        <li><a href="https://github.com/yymmt/bbs-test/compare/main...test" target="_blank">main...testブランチの比較</a></li>
    </ul>

    <h2>管理ツール</h2>
    <ul>
        <li><a href="deploy.php">デプロイ (git pull)</a></li>
        <li><a href="migrate.php">マイグレーション実行</a></li>
    </ul>
</body>
</html>