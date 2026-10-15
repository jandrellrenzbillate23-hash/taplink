<?php
declare(strict_types=1);

const APP_NAME = 'TapLink';

function app_config(string $name, ?string $default = null): ?string
{
    $value = getenv($name);
    return $value === false ? $default : $value;
}

session_name('taplink_session');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
]);
session_start();

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = app_config('TAPLINK_DB_HOST', '127.0.0.1');
    $port = app_config('TAPLINK_DB_PORT', '3306');
    $database = app_config('TAPLINK_DB_NAME', 'taplink_nfc');
    $username = app_config('TAPLINK_DB_USER', 'root');
    $password = app_config('TAPLINK_DB_PASSWORD', '');
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    return $pdo;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Please sign in to continue.'], 401);
    }
    $statement = db()->prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?');
    $statement->execute([$user['id']]);
    $account = $statement->fetch();
    if (!$account || !(bool) $account['is_active']) {
        unset($_SESSION['user']);
        json_response(['error' => 'This account is no longer active. Please sign in again.'], 401);
    }
    $_SESSION['user'] = [
        'id' => (int) $account['id'],
        'name' => $account['name'],
        'email' => $account['email'],
        'role' => $account['role'],
    ];
    return $_SESSION['user'];
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') {
        json_response(['error' => 'Administrator access is required.'], 403);
    }
    return $user;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function request_data(): array
{
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function require_csrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($provided) || !hash_equals(csrf_token(), $provided)) {
        json_response(['error' => 'Your session token expired. Refresh the page and try again.'], 419);
    }
}

function text_value(mixed $value, int $maxLength = 2000): string
{
    if (!is_string($value)) {
        json_response(['error' => 'Invalid input.'], 422);
    }
    $value = trim($value);
    if ($value === '' || mb_strlen($value) > $maxLength) {
        json_response(['error' => "Text must be between 1 and {$maxLength} characters."], 422);
    }
    return $value;
}
