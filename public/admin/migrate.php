<?php

require_once __DIR__ . '/../../database.php';

$output = '';

try {
    $pdo = getPDO();

    // マイグレーション管理テーブルの作成 (存在しない場合)
    $pdo->exec("CREATE TABLE IF NOT EXISTS migrates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // 実行済みファイルの取得
    $stmt = $pdo->query("SELECT filename FROM migrates");
    $executedFiles = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $files = glob(__DIR__ . '/../../migration/*.sql');
    sort($files); // ファイル名順に実行

    foreach ($files as $file) {
        $filename = basename($file);
        
        // 実行済みならスキップ
        if (in_array($filename, $executedFiles)) {
            continue;
        }

        $sql = file_get_contents($file);
        if (!$sql) continue;

        try {
            $pdo->exec($sql);
            $stmt = $pdo->prepare("INSERT INTO migrates (filename) VALUES (?)");
            $stmt->execute([$filename]);
            $output .= "Executed: " . $filename . "\n";
        } catch (Exception $e) {
            $output .= "Failed: " . $filename . " - " . $e->getMessage() . "\n";
            break; // エラー時は停止
        }
    }
    if (empty($e)) {
        $output .= "Migration completed.\n";
    }

} catch (PDOException $e) {
    $output .= "Migration failed: " . $e->getMessage() . "\n";
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Migration</title>
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <h1>マイグレーション実行結果</h1>
    <pre><?php echo htmlspecialchars($output, ENT_QUOTES, 'UTF-8'); ?></pre>
    <a href="index.php">管理パネルに戻る</a>
</body>
</html>