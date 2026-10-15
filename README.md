# TapLink

TapLink is a responsive PHP/MySQL website for creating personal and business link pages. A profile can show a photo, introduction, website, existing social profiles, public contact details, and a tappable business location. Visitors get one mobile-friendly page with buttons for the details the owner chose to publish.

## Requirements

- PHP 8.1 or later with PDO MySQL, `mbstring`, and sessions enabled
- MySQL 8.0+ or MariaDB 10.5+
- HTTPS for public deployment

GitHub can host the project source, but GitHub Pages cannot run this PHP/MySQL application. To run the live website, deploy the project to a PHP-capable web host and configure a MySQL-compatible database.

## Local setup with XAMPP

1. Copy the project folder into `C:\xampp\htdocs`.
2. Start Apache and MySQL in the XAMPP Control Panel.
3. Import `schema.sql` in phpMyAdmin, or run it with the MySQL command-line client.
   If upgrading an existing database, apply `profile_migration.sql` to add any missing public-profile fields. The migration is safe to rerun:

   ```powershell
   Get-Content -Raw profile_migration.sql | & C:\xampp\mysql\bin\mysql.exe --protocol=TCP --host=127.0.0.1 --user=root
   ```

4. The default local database connection is `127.0.0.1`, database `taplink_nfc`, user `root`, and an empty password. Set the `TAPLINK_DB_HOST`, `TAPLINK_DB_PORT`, `TAPLINK_DB_NAME`, `TAPLINK_DB_USER`, and `TAPLINK_DB_PASSWORD` environment variables to use different settings.
5. Create an administrator from PowerShell. Replace the example password with a unique password:

   ```powershell
   $env:TAPLINK_ADMIN_PASSWORD = "use-a-unique-password-of-10-characters-or-more"
   & C:\xampp\php\php.exe tools\create_admin.php admin@example.com
   Remove-Item Env:\TAPLINK_ADMIN_PASSWORD
   ```

6. Open `http://localhost/Landing%20page_%20NFC/` in a browser and create an account or sign in as the administrator.

Set `TAPLINK_ALLOW_REGISTRATION=false` in the web-server environment to stop new public account registration. Administrator accounts can be created or reset only through the CLI setup script.

For a public deployment, configure the database connection and administrator password through environment variables, enable HTTPS, and decide whether open account registration is appropriate. Do not commit real credentials, database exports, or uploaded profile photos. The repository ignores local profile-photo uploads.

## Features

- Responsive landing page and personal/business link-page editor
- Account registration, sign-in, and sign-out
- Profile picture, display name, headline, company, and bio
- Link buttons generated from the saved website, Instagram, Facebook, TikTok, LinkedIn, X, YouTube, WhatsApp, Telegram, phone, email, and location fields
- Publish controls, shareable profile URL, dark mode, and public contact-card download
- Administrator account and application-name management
- Session-based authentication, CSRF protection for changes, prepared SQL statements, and password hashing

## Important notes

- Profile details and social links are private until the owner publishes their page. After publishing, anyone with its link can see the public details and download the public contact card.
- Users add social profile URLs in **My link page → Social profiles**. Those existing profile fields automatically become buttons on the published page; there is no separate custom-link list.
- Personal and business profiles can show a JPG, PNG, or WebP picture (maximum 5 MB), plus a tappable location link that opens Google Maps.
- This feature stores social profile URLs; it does not log in to social networks or request OAuth access.
- A `localhost` profile URL is only reachable from the local computer. Publish TapLink on an HTTPS domain before sharing profiles with other people.
- When upgrading, the migration does not delete old scan/template tables or custom-link data. Those legacy data are retained in the database but are no longer shown or used by TapLink.
- Use HTTPS outside local development. Configure the web server and database backups before deploying the application publicly.
