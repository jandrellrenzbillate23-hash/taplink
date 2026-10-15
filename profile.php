<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$slug = $_GET['u'] ?? '';
if (!is_string($slug) || !preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/', $slug)) {
    http_response_code(404);
    exit('Profile not found.');
}

try {
    $statement = db()->prepare(
        'SELECT u.name, p.slug, p.profile_type, p.headline, p.company, p.bio, p.phone,
                p.public_email, p.website, p.location, p.photo_filename, p.social_links
         FROM public_profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.slug = ? AND p.is_published = 1 AND u.is_active = 1'
    );
    $statement->execute([$slug]);
    $profile = $statement->fetch();
} catch (PDOException $exception) {
    error_log('TapLink public profile lookup failed: ' . $exception->getMessage());
    http_response_code(500);
    exit('This profile is temporarily unavailable.');
}

if (!$profile) {
    http_response_code(404);
    exit('Profile not found or not published.');
}

$profile['social_links'] = json_decode($profile['social_links'] ?: '{}', true) ?: [];
$escape = static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$socialNames = [
    'instagram' => 'Instagram',
    'facebook' => 'Facebook',
    'tiktok' => 'TikTok',
    'linkedin' => 'LinkedIn',
    'x' => 'X',
    'youtube' => 'YouTube',
    'whatsapp' => 'WhatsApp',
    'telegram' => 'Telegram',
];
$description = trim(($profile['headline'] ? $profile['headline'] . ' · ' : '') . ($profile['company'] ?: 'Connect with ' . $profile['name']));

if (($_GET['format'] ?? '') === 'vcard') {
    $vcardEscape = static fn (string $value): string => str_replace(["\\", ';', ',', "\r\n", "\r", "\n"], ["\\\\", '\;', '\,', '\n', '\n', '\n'], $value);
    $lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' . $vcardEscape($profile['name'])];
    if ($profile['company'] !== '') {
        $lines[] = 'ORG:' . $vcardEscape($profile['company']);
    }
    if ($profile['headline'] !== '') {
        $lines[] = 'TITLE:' . $vcardEscape($profile['headline']);
    }
    if ($profile['phone'] !== '') {
        $lines[] = 'TEL;TYPE=CELL:' . $vcardEscape($profile['phone']);
    }
    if ($profile['public_email'] !== '') {
        $lines[] = 'EMAIL:' . $vcardEscape($profile['public_email']);
    }
    if ($profile['website'] !== '') {
        $lines[] = 'URL:' . $profile['website'];
    }
    if ($profile['location'] !== '') {
        $lines[] = 'ADR;TYPE=WORK:;;' . $vcardEscape($profile['location']) . ';;;;';
        $lines[] = 'NOTE:' . $vcardEscape('Location: ' . $profile['location']);
    }
    $lines[] = 'END:VCARD';
    header('Content-Type: text/vcard; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^a-z0-9-]/i', '-', $profile['slug']) . '.vcf"');
    header('X-Content-Type-Options: nosniff');
    echo implode("\r\n", $lines) . "\r\n";
    exit;
}

$profileButtons = [];
$defaultSocialIcons = [
    'instagram' => '◎',
    'facebook' => 'f',
    'tiktok' => '♪',
    'linkedin' => 'in',
    'x' => '𝕏',
    'youtube' => '▶',
    'whatsapp' => '◔',
    'telegram' => '➤',
];
foreach ($socialNames as $network => $networkName) {
    $url = $profile['social_links'][$network] ?? '';
    $scheme = is_string($url) ? strtolower((string) parse_url($url, PHP_URL_SCHEME)) : '';
    if (is_string($url) && filter_var($url, FILTER_VALIDATE_URL) && $scheme === 'https') {
        $profileButtons[] = ['title' => $networkName, 'url' => $url, 'icon' => $defaultSocialIcons[$network]];
    }
}
if ($profile['website'] !== '' && filter_var($profile['website'], FILTER_VALIDATE_URL)) {
    $profileButtons[] = [
        'title' => 'Website',
        'url' => $profile['website'],
        'icon' => '🌐',
    ];
}
$contactUrl = 'profile.php?u=' . rawurlencode($profile['slug']) . '&format=vcard';
$photoUrl = is_string($profile['photo_filename'])
    ? 'profile_image.php?u=' . rawurlencode($profile['slug'])
    : null;
$mapUrl = $profile['location'] !== ''
    ? 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode($profile['location'])
    : null;
if ($mapUrl !== null) {
    $profileButtons[] = ['title' => 'Find us · ' . $profile['location'], 'url' => $mapUrl, 'icon' => '⌖'];
}
if ($profile['phone'] !== '') {
    $profileButtons[] = [
        'title' => 'Call ' . $profile['phone'],
        'url' => 'tel:' . preg_replace('/[^\d+*#]/', '', $profile['phone']),
        'icon' => '☎',
    ];
}
if ($profile['public_email'] !== '') {
    $profileButtons[] = ['title' => 'Email us', 'url' => 'mailto:' . $profile['public_email'], 'icon' => '✉'];
}
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="<?= $escape($description) ?>">
  <meta property="og:title" content="<?= $escape($profile['name']) ?> · TapLink">
  <meta property="og:description" content="<?= $escape($description) ?>">
  <title><?= $escape($profile['name']) ?> · TapLink</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="assets/theme.js?v=<?= filemtime(__DIR__ . '/assets/theme.js') ?>"></script>
  <link rel="stylesheet" href="assets/style.css?v=<?= filemtime(__DIR__ . '/assets/style.css') ?>">
</head>
<body class="public-profile-page">
  <main class="public-profile-card">
    <div class="public-profile-topbar"><a class="brand profile-brand" href="index.php"><span class="brand-mark">⌁</span><span>taplink<span class="brand-light">.</span></span></a><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode"><svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.4A8.3 8.3 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"/></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></button></div>
    <?php if ($photoUrl !== null): ?><img class="public-profile-avatar" src="<?= $escape($photoUrl) ?>" alt="<?= $escape($profile['name']) ?> profile picture"><?php else: ?><div class="public-profile-avatar"><?= $escape(mb_strtoupper(mb_substr($profile['name'], 0, 1))) ?></div><?php endif; ?>
    <?php if ($profile['profile_type'] === 'business'): ?><span class="public-profile-type">BUSINESS</span><?php endif; ?>
    <h1><?= $escape($profile['name']) ?></h1>
    <?php if ($profile['headline'] !== ''): ?><p class="public-profile-headline"><?= $escape($profile['headline']) ?></p><?php endif; ?>
    <?php if ($profile['company'] !== ''): ?><p class="public-profile-company"><?= $escape($profile['company']) ?></p><?php endif; ?>
    <?php if ($profile['bio'] !== ''): ?><p class="public-profile-bio"><?= nl2br($escape($profile['bio'])) ?></p><?php endif; ?>
    <div class="linktree-buttons">
      <?php foreach ($profileButtons as $button): ?><a class="linktree-button" href="<?= $escape($button['url']) ?>"<?= preg_match('/^https?:/i', $button['url']) ? ' target="_blank" rel="noopener noreferrer"' : '' ?>><span class="linktree-button-icon"><?= $escape($button['icon']) ?></span><span><?= $escape($button['title']) ?></span><span class="linktree-button-arrow">↗</span></a><?php endforeach; ?>
      <?php if ($profileButtons === []): ?><p class="public-profile-empty-links">This page has no public links yet.</p><?php endif; ?>
    </div>
    <div class="public-profile-actions">
      <a class="button button-primary button-wide" href="<?= $escape($contactUrl) ?>">Save contact <span>↓</span></a>
      <button class="button button-secondary button-wide" id="share-profile" type="button">Share profile <span>↗</span></button>
    </div>
    <footer class="public-profile-footer">A little more connected. <a href="index.php">Create your TapLink</a></footer>
  </main>
  <script>
    document.querySelector('#share-profile').addEventListener('click', async () => {
      const shareData = { title: <?= json_encode($profile['name'] . ' · TapLink', JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>, url: location.href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else {
          await navigator.clipboard.writeText(location.href);
          alert('Profile link copied.');
        }
      } catch (error) {
        if (error.name !== 'AbortError') alert('Could not share this link. Copy the page address from your browser.');
      }
    });
  </script>
</body>
</html>
