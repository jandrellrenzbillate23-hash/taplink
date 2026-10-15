<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$slug = $_GET['u'] ?? '';
if (!is_string($slug) || !preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/', $slug)) {
    http_response_code(404);
    exit;
}

$viewer = current_user();
$viewerId = $viewer ? (int) $viewer['id'] : 0;

try {
    $statement = db()->prepare(
        'SELECT p.photo_filename
         FROM public_profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.slug = ? AND u.is_active = 1 AND (p.is_published = 1 OR p.user_id = ?)'
    );
    $statement->execute([$slug, $viewerId]);
    $filename = $statement->fetchColumn();
} catch (PDOException $exception) {
    error_log('TapLink profile photo lookup failed: ' . $exception->getMessage());
    http_response_code(500);
    exit;
}

if (!is_string($filename) || !preg_match('/^[a-f0-9]{48}\.(jpg|png|webp)$/', $filename)) {
    http_response_code(404);
    exit;
}

$path = __DIR__ . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'profile-photos' . DIRECTORY_SEPARATOR . $filename;
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($path);
if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . (string) filesize($path));
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; sandbox");
readfile($path);
