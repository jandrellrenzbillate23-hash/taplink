<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$user = current_user();
$appTitle = APP_NAME;
try {
    $setting = db()->query("SELECT setting_value FROM app_settings WHERE setting_key = 'app_name'")->fetchColumn();
    if (is_string($setting) && $setting !== '') {
        $appTitle = $setting;
    }
} catch (PDOException $exception) {
    error_log('TapLink settings lookup failed: ' . $exception->getMessage());
}
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
  <meta name="description" content="Create a personal or business link page with your social profiles and contact details.">
  <title><?= htmlspecialchars($appTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="assets/theme.js?v=<?= filemtime(__DIR__ . '/assets/theme.js') ?>"></script>
  <link rel="stylesheet" href="assets/style.css?v=<?= filemtime(__DIR__ . '/assets/style.css') ?>">
  <script src="assets/app.js?v=<?= filemtime(__DIR__ . '/assets/app.js') ?>" defer></script>
</head>
<body data-authenticated="<?= $user ? 'true' : 'false' ?>" data-role="<?= htmlspecialchars($user['role'] ?? '', ENT_QUOTES, 'UTF-8') ?>">
  <div class="toast-region" id="toast-region" aria-live="polite"></div>
  <?php if ($user): ?>
    <header class="app-header">
      <a class="brand" href="#profile" aria-label="TapLink home"><span class="brand-mark">⌁</span><span>taplink<span class="brand-light">.</span></span></a>
      <nav class="app-nav" aria-label="Main navigation">
        <a href="#profile" class="nav-link active" data-view="profile">My link page</a>
        <?php if ($user['role'] === 'admin'): ?><a href="#admin" class="nav-link" data-view="admin">Admin</a><?php endif; ?>
      </nav>
      <div class="header-user"><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode"><svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.4A8.3 8.3 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"/></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></button><span class="avatar"><?= htmlspecialchars(strtoupper(substr($user['name'], 0, 1)), ENT_QUOTES, 'UTF-8') ?></span><span class="user-name"><?= htmlspecialchars($user['name'], ENT_QUOTES, 'UTF-8') ?></span><button class="button button-quiet button-small" id="logout-button">Sign out</button></div>
    </header>
    <main class="workspace">
      <section class="app-view is-visible" id="view-profile" data-page="profile">
        <section class="panel profile-editor">
          <div class="panel-heading"><div><p class="eyebrow">YOUR PERSONAL LANDING PAGE</p><h2>One link for all your connections</h2><p class="muted">Add the contact details and social profiles you want people to see. Only publish information you’re comfortable sharing publicly.</p></div><span class="tool-symbol purple">↗</span></div>
          <form id="profile-form" class="profile-form">
            <div class="profile-photo-editor">
              <div class="profile-photo-preview" id="profile-photo-preview" aria-label="Profile photo preview"><span>⌁</span></div>
              <div class="profile-photo-copy"><b>Profile picture</b><small>Use a clear photo of yourself or your business logo. JPG, PNG, or WebP; maximum 5 MB.</small><div class="profile-photo-actions"><label class="button button-secondary button-small" for="profile-photo-file">Choose photo</label><input class="is-hidden" id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><button class="text-link is-hidden" id="remove-profile-photo" type="button">Remove photo</button><span id="profile-photo-status" aria-live="polite"></span></div></div>
            </div>
            <div class="profile-form-grid">
              <div><label class="field-label" for="profile-name">Display name</label><input class="field" id="profile-name" maxlength="120" required></div>
              <div><label class="field-label" for="profile-slug">Your page address</label><div class="slug-input"><span id="profile-url-prefix"></span><input class="field" id="profile-slug" maxlength="40" pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" required></div><small class="field-help">Lowercase letters, numbers, and hyphens. At least 3 characters.</small></div>
              <div><label class="field-label" for="profile-type">Page type</label><select class="field" id="profile-type"><option value="personal">Personal profile</option><option value="business">Business profile</option></select></div>
              <div><label class="field-label" for="profile-headline">Headline / job title</label><input class="field" id="profile-headline" maxlength="120" placeholder="e.g. Photographer & creative director"></div>
              <div><label class="field-label" for="profile-company">Company</label><input class="field" id="profile-company" maxlength="120" placeholder="Business or organization"></div>
              <div><label class="field-label" for="profile-phone">Public phone</label><input class="field" id="profile-phone" maxlength="40" type="tel" autocomplete="tel"></div>
              <div><label class="field-label" for="profile-email">Public email</label><input class="field" id="profile-email" maxlength="254" type="email" autocomplete="email"></div>
              <div class="profile-form-span"><label class="field-label" for="profile-website">Website</label><input class="field" id="profile-website" maxlength="500" type="url" placeholder="https://yourwebsite.com"><small class="field-help">Use a full HTTPS link so it opens securely for visitors.</small></div>
              <div class="profile-form-span"><label class="field-label" for="profile-location">Business / meetup location</label><input class="field" id="profile-location" maxlength="300" placeholder="Street address, city, or a place name"><small class="field-help">Visitors can tap this address to open it in Google Maps. Leave it blank for a private or online-only profile.</small></div>
              <div class="profile-form-span"><label class="field-label" for="profile-bio">About you</label><textarea class="field" id="profile-bio" rows="3" maxlength="600" placeholder="A short introduction for people who visit your page"></textarea></div>
            </div>
            <div class="social-editor"><p class="eyebrow">SOCIAL PROFILES</p><div class="profile-form-grid">
              <div><label class="field-label" for="social-instagram">Instagram</label><input class="field social-input" id="social-instagram" data-network="instagram" type="url" placeholder="https://instagram.com/yourname"></div>
              <div><label class="field-label" for="social-facebook">Facebook</label><input class="field social-input" id="social-facebook" data-network="facebook" type="url" placeholder="https://facebook.com/yourname"></div>
              <div><label class="field-label" for="social-tiktok">TikTok</label><input class="field social-input" id="social-tiktok" data-network="tiktok" type="url" placeholder="https://tiktok.com/@yourname"></div>
              <div><label class="field-label" for="social-linkedin">LinkedIn</label><input class="field social-input" id="social-linkedin" data-network="linkedin" type="url" placeholder="https://linkedin.com/in/yourname"></div>
              <div><label class="field-label" for="social-x">X</label><input class="field social-input" id="social-x" data-network="x" type="url" placeholder="https://x.com/yourname"></div>
              <div><label class="field-label" for="social-youtube">YouTube</label><input class="field social-input" id="social-youtube" data-network="youtube" type="url" placeholder="https://youtube.com/@yourname"></div>
              <div><label class="field-label" for="social-whatsapp">WhatsApp</label><input class="field social-input" id="social-whatsapp" data-network="whatsapp" type="url" placeholder="https://wa.me/your-number"></div>
              <div><label class="field-label" for="social-telegram">Telegram</label><input class="field social-input" id="social-telegram" data-network="telegram" type="url" placeholder="https://t.me/yourname"></div>
            </div></div>
            <label class="checkbox-field profile-publish"><input type="checkbox" id="profile-published"><span><b>Publish my page</b><small>Anyone with your page link can see the public details above.</small></span></label>
            <div class="profile-save-row"><div><span class="profile-link-preview" id="profile-link-preview">Your page link will appear here.</span><small class="field-help">For real-world sharing, host TapLink on a public HTTPS website; localhost links only work on this computer.</small><button type="button" class="text-link" id="copy-profile-link">Copy link</button></div><div class="profile-save-actions"><a class="button button-secondary is-hidden" id="preview-profile" target="_blank" rel="noopener noreferrer">Preview page ↗</a><button class="button button-primary" type="submit">Save profile</button></div></div>
          </form>
        </section>
      </section>

      <section class="app-view" id="view-admin" data-page="admin">
        <div class="page-heading"><div><p class="eyebrow">ADMINISTRATION</p><h1>Manage TapLink.</h1><p class="muted">Manage accounts and application settings.</p></div></div>
        <div class="stat-grid admin-stats"><article class="stat-card"><span class="stat-label">Registered users</span><strong class="stat-value" data-admin-stat="users">—</strong></article></div>
        <article class="panel admin-panel"><div class="panel-heading"><div><p class="eyebrow">ACCOUNT MANAGEMENT</p><h2>Users</h2></div></div><div class="table-wrap"><table><thead><tr><th>USER</th><th>EMAIL</th><th>ROLE</th><th>JOINED</th><th>STATUS</th><th></th></tr></thead><tbody id="admin-user-rows"><tr><td colspan="6" class="empty-state">Loading users…</td></tr></tbody></table></div></article>
        <article class="panel admin-settings"><p class="eyebrow">APPLICATION SETTINGS</p><h2>Workspace name</h2><form id="settings-form"><label class="field-label" for="app-name">Application name</label><input class="field" id="app-name" maxlength="80" required><button class="button button-secondary settings-save" type="submit">Save settings</button></form><p class="muted small-copy">New account registration can be managed using the <code>TAPLINK_ALLOW_REGISTRATION</code> environment variable.</p></article>
      </section>
    </main>
  <?php else: ?>
    <header class="public-header"><a class="brand" href="#"><span class="brand-mark">⌁</span><span>taplink<span class="brand-light">.</span></span></a><nav><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#contact">Contact</a></nav><div class="public-actions"><button class="button button-quiet" data-open-auth="login">Log in</button><button class="button button-primary button-small" data-open-auth="register">Get started <span>↗</span></button><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode"><svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.4A8.3 8.3 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"/></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg></button></div></header>
    <main class="landing">
      <section class="hero"><div class="hero-copy"><div class="hero-pill"><span></span> ALL YOUR CONNECTIONS, ONE PAGE</div><h1>One page.<br><span>All of you.</span></h1><p>Create a personal or business link page with your photo, social profiles, contact details, and location—ready to share anywhere.</p><div class="hero-actions"><button class="button button-primary button-large" data-open-auth="register">Create your page <span>↗</span></button><a href="#how-it-works" class="button button-outline button-large">See how it works <span>↓</span></a></div><div class="hero-proof"><div class="proof-avatars"><span>T</span><span>L</span><span>+</span></div><p><b>Simple by design</b><br>One link for your personal or business profile.</p></div></div><div class="hero-visual" aria-hidden="true"><div class="hero-circle circle-back"></div><div class="hero-circle circle-front"></div><div class="phone-mock"><div class="phone-speaker"></div><div class="phone-top"><span>9:41</span><span>● ● ▰</span></div><div class="phone-greeting">YOUR DIGITAL WORLD</div><div class="phone-card"><div class="phone-profile">◎</div><b>One little link.</b><span>A whole lot of possibility.</span><div class="phone-link">taplink.app/you <span>↗</span></div></div><div class="phone-bottom"><span>◎</span><span>f</span><span>in</span></div></div><div class="float-tag"><span>↗</span><div><b>Page shared</b><small>taplink.app/you</small></div></div><span class="hero-spark">✳</span></div></section>
      <section class="trust-strip"><span>ONE SIMPLE TOOL FOR</span><b>Creators</b><i></i><b>Small businesses</b><i></i><b>Everyday sharing</b><i></i><b>Better connections</b></section>
      <section class="landing-section features-section" id="features"><div class="section-heading"><p class="eyebrow">YOUR PERSONAL LINK PAGE</p><h2>Everything you share.<br><span>All in one place.</span></h2><p>Build a polished page that brings your existing profiles and contact information together.</p></div><div class="feature-grid"><article class="feature-card feature-lavender"><span class="feature-icon">◎</span><p class="eyebrow">MAKE IT YOURS</p><h3>Your profile, your style</h3><p>Add a photo, choose personal or business, and introduce yourself.</p><span class="feature-decoration">✦</span></article><article class="feature-card feature-mint"><span class="feature-icon">↗</span><p class="eyebrow">STAY CONNECTED</p><h3>Socials in one spot</h3><p>Show your Instagram, Facebook, TikTok, LinkedIn, X, YouTube, WhatsApp, and Telegram profiles as ready-to-tap buttons.</p><span class="feature-decoration">✳</span></article><article class="feature-card feature-peach"><span class="feature-icon">⌖</span><p class="eyebrow">SHARE WITH EASE</p><h3>Contact and location</h3><p>Let visitors call, email, save your contact, or find your business on a map.</p><span class="feature-decoration">◷</span></article></div></section>
      <section class="how-section" id="how-it-works"><div class="how-art" aria-hidden="true"><div class="how-tag">↗</div><div class="how-ring ring-a"></div><div class="how-ring ring-b"></div><div class="how-ring ring-c"></div><span class="how-star">✦</span></div><div class="how-copy"><p class="eyebrow">THREE SIMPLE STEPS</p><h2>Your page,<br><span>ready to share.</span></h2><p>Choose the details visitors should see, then publish your link page.</p><div class="steps"><div><span>01</span><p><b>Make your profile</b><small>Add your name, photo, bio, and page type.</small></p></div><div><span>02</span><p><b>Connect your profiles</b><small>Fill in the social accounts and contact details you want to share.</small></p></div><div><span>03</span><p><b>Publish your page</b><small>Copy your link and share it anywhere.</small></p></div></div><button class="button button-primary" data-open-auth="register">Get started <span>↗</span></button></div></section>
      <section class="cta-section" id="contact"><div><p class="eyebrow">A LITTLE MORE CONNECTED</p><h2>Ready when<br>you are.</h2><p>Bring all your favorite ways to connect together on one page.</p><button class="button button-light button-large" data-open-auth="register">Create your free account <span>↗</span></button></div><div class="cta-decoration" aria-hidden="true"><span>⌁</span><i>✳</i><b>↗</b></div></section>
      <footer class="public-footer"><a class="brand" href="#"><span class="brand-mark">⌁</span><span>taplink<span class="brand-light">.</span></span></a><span>Thoughtfully connected. © <span id="year"></span> TapLink</span><a href="mailto:hello@taplink.example">Get in touch ↗</a></footer>
    </main>
    <dialog id="auth-dialog" class="modal auth-modal"><form id="auth-form"><div class="modal-heading"><div><p class="eyebrow">WELCOME TO TAPLINK</p><h2 id="auth-title">Create your account</h2></div><button type="button" class="icon-button" data-close-dialog aria-label="Close">×</button></div><div id="register-name-row"><label class="field-label" for="auth-name">Your name</label><input class="field" id="auth-name" maxlength="120" autocomplete="name"></div><label class="field-label" for="auth-email">Email address</label><input class="field" id="auth-email" type="email" maxlength="254" autocomplete="email" required><label class="field-label" for="auth-password">Password</label><input class="field" id="auth-password" type="password" minlength="10" maxlength="200" autocomplete="current-password" required><p class="auth-hint" id="password-hint">Use at least 10 characters.</p><button class="button button-primary button-wide" id="auth-submit" type="submit">Create account</button><p class="auth-switch"><span id="auth-switch-copy">Already have an account?</span> <button type="button" class="text-link" id="auth-switch-button">Log in</button></p></form></dialog>
  <?php endif; ?>
</body>
</html>
