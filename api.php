<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

header('X-Content-Type-Options: nosniff');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

if ($method === 'POST') {
    require_csrf();
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $data = str_starts_with(strtolower($contentType), 'multipart/form-data')
        ? $_POST
        : request_data();
} elseif ($method !== 'GET') {
    json_response(['error' => 'Method not allowed.'], 405);
} else {
    $data = [];
}

try {
    $pdo = db();

    if ($method === 'POST' && $action === 'register') {
        $allowRegistration = filter_var(app_config('TAPLINK_ALLOW_REGISTRATION', 'true'), FILTER_VALIDATE_BOOLEAN);
        if (!$allowRegistration) {
            json_response(['error' => 'New account registration is currently closed.'], 403);
        }
        $name = text_value($data['name'] ?? null, 120);
        $email = filter_var(strtolower(trim((string) ($data['email'] ?? ''))), FILTER_VALIDATE_EMAIL);
        $password = $data['password'] ?? null;
        if (!$email || strlen($email) > 254) {
            json_response(['error' => 'Enter a valid email address.'], 422);
        }
        if (!is_string($password) || strlen($password) < 10 || strlen($password) > 200) {
            json_response(['error' => 'Password must be between 10 and 200 characters.'], 422);
        }
        $statement = $pdo->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
        try {
            $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                json_response(['error' => 'An account with that email already exists.'], 409);
            }
            throw $exception;
        }
        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => 'user'];
        csrf_token();
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'login') {
        $email = filter_var(strtolower(trim((string) ($data['email'] ?? ''))), FILTER_VALIDATE_EMAIL);
        $password = $data['password'] ?? '';
        if (!$email || !is_string($password) || strlen($password) > 200) {
            json_response(['error' => 'Email or password is incorrect.'], 401);
        }
        $statement = $pdo->prepare('SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?');
        $statement->execute([$email]);
        $account = $statement->fetch();
        if (!$account || !(bool) $account['is_active'] || !password_verify($password, $account['password_hash'])) {
            json_response(['error' => 'Email or password is incorrect.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = [
            'id' => (int) $account['id'],
            'name' => $account['name'],
            'email' => $account['email'],
            'role' => $account['role'],
        ];
        csrf_token();
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        json_response(['ok' => true]);
    }

    if ($method === 'GET' && $action === 'profile_settings') {
        $user = require_user();
        $slugBase = (string) preg_replace('/[^a-z0-9]+/', '-', strtolower($user['name']));
        $slugBase = trim($slugBase, '-');
        if ($slugBase === '') {
            $slugBase = 'member';
        }
        $slug = substr($slugBase, 0, 32) . '-' . (int) $user['id'];
        $statement = $pdo->prepare("INSERT IGNORE INTO public_profiles (user_id, slug, social_links) VALUES (?, ?, '{}')");
        $statement->execute([$user['id'], $slug]);
        $statement = $pdo->prepare('SELECT slug, profile_type, headline, company, bio, phone, public_email, website, location, photo_filename, social_links, is_published, updated_at FROM public_profiles WHERE user_id = ?');
        $statement->execute([$user['id']]);
        $profile = $statement->fetch();
        $profile['social_links'] = json_decode($profile['social_links'] ?: '{}', true) ?: [];
        $profile['is_published'] = (bool) $profile['is_published'];
        $profile['photo_url'] = $profile['photo_filename'] !== null
            ? 'profile_image.php?u=' . rawurlencode($profile['slug']) . '&v=' . rawurlencode((string) strtotime($profile['updated_at']))
            : null;
        unset($profile['photo_filename']);
        $profile['name'] = $user['name'];
        json_response(['profile' => $profile]);
    }

    if ($method === 'POST' && $action === 'profile_photo_upload') {
        $user = require_user();
        if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
            json_response(['error' => 'Choose a profile photo to upload.'], 422);
        }
        $upload = $_FILES['photo'];
        if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'] ?? '')) {
            json_response(['error' => 'The photo could not be uploaded. Choose a JPG, PNG, or WebP image under 5 MB.'], 422);
        }
        if (($upload['size'] ?? 0) < 1 || $upload['size'] > 5 * 1024 * 1024) {
            json_response(['error' => 'Profile photos must be smaller than 5 MB.'], 422);
        }
        $imageInfo = @getimagesize($upload['tmp_name']);
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($upload['tmp_name']);
        $allowedImages = [
            'image/jpeg' => ['extension' => 'jpg', 'type' => IMAGETYPE_JPEG],
            'image/png' => ['extension' => 'png', 'type' => IMAGETYPE_PNG],
            'image/webp' => ['extension' => 'webp', 'type' => IMAGETYPE_WEBP],
        ];
        if (
            !is_array($imageInfo)
            || !isset($allowedImages[$mimeType])
            || $imageInfo[2] !== $allowedImages[$mimeType]['type']
            || $imageInfo[0] < 1
            || $imageInfo[1] < 1
            || $imageInfo[0] > 6000
            || $imageInfo[1] > 6000
            || $imageInfo[0] * $imageInfo[1] > 24000000
        ) {
            json_response(['error' => 'Choose a valid JPG, PNG, or WebP photo with dimensions under 6000 × 6000 pixels.'], 422);
        }

        $photoDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'profile-photos';
        if (!is_dir($photoDirectory) && !mkdir($photoDirectory, 0750, true) && !is_dir($photoDirectory)) {
            throw new RuntimeException('Unable to create the profile photo directory.');
        }
        $protectionFile = $photoDirectory . DIRECTORY_SEPARATOR . '.htaccess';
        if (!is_file($protectionFile) && file_put_contents($protectionFile, "Require all denied\nOptions -Indexes\n") === false) {
            throw new RuntimeException('Unable to protect the profile photo directory.');
        }
        $filename = bin2hex(random_bytes(24)) . '.' . $allowedImages[$mimeType]['extension'];
        $destination = $photoDirectory . DIRECTORY_SEPARATOR . $filename;
        if (!move_uploaded_file($upload['tmp_name'], $destination)) {
            throw new RuntimeException('Unable to store the profile photo.');
        }

        $ensureProfile = $pdo->prepare("INSERT IGNORE INTO public_profiles (user_id, slug, social_links) VALUES (?, ?, '{}')");
        $ensureProfile->execute([$user['id'], substr('member-' . (int) $user['id'], 0, 40)]);
        $statement = $pdo->prepare('SELECT photo_filename FROM public_profiles WHERE user_id = ?');
        $statement->execute([$user['id']]);
        $previousFilename = $statement->fetchColumn();
        try {
            $statement = $pdo->prepare('UPDATE public_profiles SET photo_filename = ? WHERE user_id = ?');
            $statement->execute([$filename, $user['id']]);
        } catch (PDOException $exception) {
            if (is_file($destination)) {
                unlink($destination);
            }
            throw $exception;
        }
        if (is_string($previousFilename) && preg_match('/^[a-f0-9]{48}\.(?:jpg|png|webp)$/', $previousFilename)) {
            $previousPath = $photoDirectory . DIRECTORY_SEPARATOR . $previousFilename;
            if (is_file($previousPath) && !unlink($previousPath)) {
                error_log('TapLink could not remove the previous profile photo for user ' . (int) $user['id']);
            }
        }
        $statement = $pdo->prepare('SELECT slug, updated_at FROM public_profiles WHERE user_id = ?');
        $statement->execute([$user['id']]);
        $profile = $statement->fetch();
        json_response([
            'ok' => true,
            'photo_url' => 'profile_image.php?u=' . rawurlencode($profile['slug']) . '&v=' . time(),
        ]);
    }

    if ($method === 'POST' && $action === 'profile_photo_delete') {
        $user = require_user();
        $statement = $pdo->prepare('SELECT photo_filename FROM public_profiles WHERE user_id = ?');
        $statement->execute([$user['id']]);
        $filename = $statement->fetchColumn();
        $statement = $pdo->prepare('UPDATE public_profiles SET photo_filename = NULL WHERE user_id = ?');
        $statement->execute([$user['id']]);
        if (is_string($filename) && preg_match('/^[a-f0-9]{48}\.(?:jpg|png|webp)$/', $filename)) {
            $path = __DIR__ . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'profile-photos' . DIRECTORY_SEPARATOR . $filename;
            if (is_file($path) && !unlink($path)) {
                error_log('TapLink could not remove the profile photo for user ' . (int) $user['id']);
            }
        }
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'profile_save') {
        $user = require_user();
        $name = text_value($data['name'] ?? null, 120);
        $slug = strtolower(trim((string) ($data['slug'] ?? '')));
        if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/', $slug)) {
            json_response(['error' => 'Your profile URL must be 3–40 characters using lowercase letters, numbers, and hyphens.'], 422);
        }
        $headline = trim((string) ($data['headline'] ?? ''));
        $company = trim((string) ($data['company'] ?? ''));
        $bio = trim((string) ($data['bio'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $publicEmail = strtolower(trim((string) ($data['public_email'] ?? '')));
        $website = trim((string) ($data['website'] ?? ''));
        $profileType = $data['profile_type'] ?? 'personal';
        $location = trim((string) ($data['location'] ?? ''));
        if (!in_array($profileType, ['personal', 'business'], true)) {
            json_response(['error' => 'Choose personal or business profile type.'], 422);
        }
        if (mb_strlen($headline) > 120 || mb_strlen($company) > 120 || mb_strlen($bio) > 600 || mb_strlen($phone) > 40) {
            json_response(['error' => 'One or more profile fields exceed their character limit.'], 422);
        }
        if (mb_strlen($location) > 300) {
            json_response(['error' => 'Location must be no more than 300 characters.'], 422);
        }
        if ($publicEmail !== '' && (!filter_var($publicEmail, FILTER_VALIDATE_EMAIL) || strlen($publicEmail) > 254)) {
            json_response(['error' => 'Enter a valid public contact email address.'], 422);
        }
        if ($website !== '' && (!filter_var($website, FILTER_VALIDATE_URL) || strtolower((string) parse_url($website, PHP_URL_SCHEME)) !== 'https')) {
            json_response(['error' => 'Enter a valid website URL beginning with https://.'], 422);
        }
        $socialHosts = [
            'instagram' => ['instagram.com'],
            'facebook' => ['facebook.com', 'fb.com'],
            'tiktok' => ['tiktok.com'],
            'linkedin' => ['linkedin.com'],
            'x' => ['x.com', 'twitter.com'],
            'youtube' => ['youtube.com', 'youtu.be'],
            'whatsapp' => ['wa.me', 'whatsapp.com'],
            'telegram' => ['t.me', 'telegram.me', 'telegram.org'],
        ];
        $socialLinks = $data['social_links'] ?? [];
        if (!is_array($socialLinks)) {
            json_response(['error' => 'Invalid social links.'], 422);
        }
        $cleanSocialLinks = [];
        foreach ($socialHosts as $network => $allowedHosts) {
            $link = trim((string) ($socialLinks[$network] ?? ''));
            if ($link === '') {
                continue;
            }
            $host = strtolower((string) parse_url($link, PHP_URL_HOST));
            $validHost = false;
            foreach ($allowedHosts as $allowedHost) {
                if ($host === $allowedHost || str_ends_with($host, '.' . $allowedHost)) {
                    $validHost = true;
                    break;
                }
            }
            if (!filter_var($link, FILTER_VALIDATE_URL) || strtolower((string) parse_url($link, PHP_URL_SCHEME)) !== 'https' || !$validHost || mb_strlen($link) > 500) {
                json_response(['error' => 'Enter a valid HTTPS ' . ucfirst($network) . ' profile link.'], 422);
            }
            $cleanSocialLinks[$network] = $link;
        }
        $statement = $pdo->prepare('UPDATE public_profiles SET slug = ?, profile_type = ?, headline = ?, company = ?, bio = ?, phone = ?, public_email = ?, website = ?, location = ?, social_links = ?, is_published = ? WHERE user_id = ?');
        $ensureProfile = $pdo->prepare("INSERT IGNORE INTO public_profiles (user_id, slug, social_links) VALUES (?, ?, '{}')");
        $ensureProfile->execute([$user['id'], substr('member-' . (int) $user['id'], 0, 40)]);
        $pdo->beginTransaction();
        try {
            $updateName = $pdo->prepare('UPDATE users SET name = ? WHERE id = ?');
            $updateName->execute([$name, $user['id']]);
            $statement->execute([
                $slug,
                $profileType,
                $headline,
                $company,
                $bio,
                $phone,
                $publicEmail,
                $website,
                $location,
                json_encode($cleanSocialLinks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                !empty($data['is_published']) ? 1 : 0,
                $user['id'],
            ]);
            $pdo->commit();
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($exception->getCode() === '23000') {
                json_response(['error' => 'That profile URL is already taken. Choose another one.'], 409);
            }
            throw $exception;
        }
        $_SESSION['user']['name'] = $name;
        json_response(['ok' => true, 'slug' => $slug, 'name' => $name]);
    }

    if ($method === 'GET' && $action === 'admin') {
        require_admin();
        $stats = [
            'users' => (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
        ];
        $users = $pdo->query('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 500')->fetchAll();
        $appName = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key = 'app_name'")->fetchColumn() ?: APP_NAME;
        json_response(['stats' => $stats, 'users' => $users, 'appName' => $appName]);
    }

    if ($method === 'POST' && $action === 'admin_user_update') {
        $admin = require_admin();
        $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
        $role = $data['role'] ?? null;
        $active = $data['active'] ?? null;
        if (!$id || !in_array($role, ['user', 'admin'], true) || !is_bool($active)) {
            json_response(['error' => 'Invalid user update.'], 422);
        }
        if ((int) $id === (int) $admin['id'] && ($role !== 'admin' || !$active)) {
            json_response(['error' => 'You cannot remove your own administrator access.'], 422);
        }
        $statement = $pdo->prepare('SELECT role, is_active FROM users WHERE id = ?');
        $statement->execute([$id]);
        $target = $statement->fetch();
        if (!$target) {
            json_response(['error' => 'User not found.'], 404);
        }
        if ($target['role'] === 'admin' && (int) $target['is_active'] === 1 && ($role !== 'admin' || !$active)) {
            $adminCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1")->fetchColumn();
            if ($adminCount <= 1) {
                json_response(['error' => 'The last active administrator cannot be disabled or demoted.'], 422);
            }
        }
        $statement = $pdo->prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?');
        $statement->execute([$role, (int) $active, $id]);
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'admin_settings') {
        require_admin();
        $name = text_value($data['app_name'] ?? null, 80);
        $statement = $pdo->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('app_name', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $statement->execute([$name]);
        json_response(['ok' => true]);
    }

    json_response(['error' => 'Not found.'], 404);
} catch (PDOException $exception) {
    error_log('TapLink database error: ' . $exception->getMessage());
    json_response(['error' => 'The database request failed. Check your database setup and try again.'], 500);
} catch (RuntimeException $exception) {
    error_log('TapLink runtime error: ' . $exception->getMessage());
    json_response(['error' => 'The request could not be completed.'], 500);
}
