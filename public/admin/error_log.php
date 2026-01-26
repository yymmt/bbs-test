<?php
// このファイルはBasic認証(.htaccess)で保護されていることを想定しています。

$log_file_path = __DIR__ . '/../../php-error.log';
$log_content = '';

if (file_exists($log_file_path)) {
    // ファイルを逆順に読み込む方が新しいログが上に来て見やすいが、
    // 巨大なログファイルだとメモリを消費するため、今回は単純に読み込む
    $log_content = file_get_contents($log_file_path);
    if ($log_content === false) {
        $log_content = 'エラーログの読み込みに失敗しました。';
    }
} else {
    $log_content = 'エラーログファイルが見つかりません。';
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Error Log Viewer</title>
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <h1>エラーログ</h1>
    <pre><?php echo htmlspecialchars($log_content, ENT_QUOTES, 'UTF-8'); ?></pre>
    <a href="index.php">管理パネルに戻る</a>
</body>
</html>