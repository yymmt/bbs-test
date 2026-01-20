<?php

require_once __DIR__ . '/../config.php';
$config = require __DIR__ . '/../config.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $dsn = "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // マイグレーション管理テーブルの作成 (存在しない場合)
    $pdo->exec("CREATE TABLE IF NOT EXISTS migrates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // 実行済みファイルの取得
    $stmt = $pdo->query("SELECT filename FROM migrates");
    $executedFiles = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $files = glob(__DIR__ . '/../migration/*.sql');
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
            $pdo->beginTransaction();
            $pdo->exec($sql);
            $stmt = $pdo->prepare("INSERT INTO migrates (filename) VALUES (?)");
            $stmt->execute([$filename]);
            $pdo->commit();
            echo "Executed: " . $filename . "\n";
        } catch (Exception $e) {
            $pdo->rollBack();
            echo "Failed: " . $filename . " - " . $e->getMessage() . "\n";
            exit(1); // エラー時は停止
        }
    }
    echo "Migration completed.\n";

} catch (PDOException $e) {
    http_response_code(500);
    echo "Migration failed: " . $e->getMessage() . "\n";
}