# TapLink

TapLink is a responsive link-page app for personal and business profiles. Profiles can show a photo, introduction, website, social profiles, public contact details, and a tappable business location.

## Deploy to Netlify

Netlify does not execute PHP. The Netlify version uses the static `index.html` frontend, Netlify Functions, and Supabase for authentication, PostgreSQL data, and private photo storage. It starts with a fresh Supabase database; it does not import accounts, profiles, or photos from an existing MySQL installation.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. In Supabase **Authentication → URL Configuration**, set the Site URL to your Netlify URL and add that URL to the allowed redirect URLs. For local Netlify testing, add `http://localhost:8888`.
4. In Netlify, connect this repository and use the settings from [`netlify.toml`](./netlify.toml): publish directory `public` and functions directory `netlify/functions`. The build command copies the shared styles and theme script into the curated publish folder. Deploy from the connected repository so Netlify also builds and deploys the Functions; do not publish the repository root.
5. In the Netlify site’s environment variables, add these values for the Functions runtime:
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_ANON_KEY` — the project’s anon/public API key
   - `SUPABASE_SERVICE_ROLE_KEY` — the service-role secret; keep it private and never add it to frontend code
6. Redeploy the Netlify site after setting the variables.
7. Create the first account, then promote it to administrator in the Supabase SQL Editor. Replace the email with the account’s email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where lower(email) = lower('admin@example.com');
   ```

   Sign out and back in for the administrator role to appear in the session.

Supabase Auth controls whether new accounts can register. To close registration, disable new user sign-ups in the Supabase Authentication settings. Profile images are stored in a private Supabase Storage bucket and served using short-lived signed URLs. The curated `public` directory keeps PHP sources, database scripts, and local storage files out of Netlify's static publish output.

## Run the PHP version locally

The original PHP/MySQL version remains available for local XAMPP use and PHP-capable hosting. It is not the version Netlify runs.

- PHP 8.1 or later with PDO MySQL, `mbstring`, and sessions enabled
- MySQL 8.0+ or MariaDB 10.5+
- HTTPS for public deployment

### XAMPP setup

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
- Supabase authentication, row-level security for profile data, and protected Netlify Function operations

## Important notes

- Profile details and social links are private until the owner publishes their page. After publishing, anyone with its link can see the public details and download the public contact card.
- Users add social profile URLs in **My link page → Social profiles**. Those existing profile fields automatically become buttons on the published page; there is no separate custom-link list.
- Personal and business profiles can show a JPG, PNG, or WebP picture (maximum 5 MB), plus a tappable location link that opens Google Maps.
- This feature stores social profile URLs; it does not log in to social networks or request OAuth access.
- Netlify profile URLs use the `?u=slug` query format. A `localhost` profile URL is only reachable from the local computer.
- When upgrading, the migration does not delete old scan/template tables or custom-link data. Those legacy data are retained in the database but are no longer shown or used by TapLink.
- Use HTTPS outside local development. Configure the web server and database backups before deploying the application publicly.
