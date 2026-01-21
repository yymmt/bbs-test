<?php
// このファイルはBasic認証(.htaccess)で保護されていることを想定しています。

// Webサーバーの実行ユーザーがパスワードなしでgitコマンドを実行できるよう、
// SSHキーの設定などを行っておくことが推奨されます。

// リポジトリのルートパスを設定
$repo_path = __DIR__ . '/../../';

// リポジトリのディレクトリに移動
chdir($repo_path);

// git pull を実行し、標準エラー出力を標準出力にリダイレクトしてエラーも補足する
$output = shell_exec('git pull 2>&1');
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Deploy</title>
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <h1>デプロイ実行結果</h1>
    <pre><?php echo htmlspecialchars($output, ENT_QUOTES, 'UTF-8'); ?></pre>
    <a href="index.php">管理パネルに戻る</a>
</body>
</html>