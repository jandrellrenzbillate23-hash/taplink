<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$email = $argv[1] ?? '';
$password = getenv('TAPLINK_ADMIN_PASSWORD') ?: '';
$name = getenv('TAPLINK_ADMIN_NAME') ?: 'TapLink Admin';
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 10) {
    fwrite(STDERR, "Usage: set TAPLINK_ADMIN_PASSWORD to a password of at least 10 characters, then run php tools/create_admin.php admin@example.com\n");
    exit(1);
}

$statement = db()->prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', is_active = 1"
);
$statement->execute([$name, strtolower($email), password_hash($password, PASSWORD_DEFAULT)]);
fwrite(STDOUT, "Administrator account ready for {$email}\n");
