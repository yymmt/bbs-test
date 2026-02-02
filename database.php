<?php

/**
 * Returns a PDO database connection object.
 *
 * This function establishes a database connection using the settings from config.php.
 * It uses a static variable to ensure that the connection is only made once per request.
 *
 * @return PDO The PDO object for database interaction.
 * @throws PDOException if the connection fails.
 */
function getPDO(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $config = require __DIR__ . '/config.php';
        $dsn = "mysql:host={$config['db']['host']};dbname={$config['db']['dbname']};charset={$config['db']['charset']}";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        
        $pdo = new PDO($dsn, $config['db']['user'], $config['db']['password'], $options);
    }

    return $pdo;
}