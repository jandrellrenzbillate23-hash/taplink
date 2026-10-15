# TapLink

TapLink is a responsive link-page app for personal and business profiles. Profiles can show a photo, introduction, website, social profiles, public contact details, and a tappable business location.

## Deploy to Netlify

Netlify does not execute PHP. The Netlify version uses a static frontend, Netlify Functions, Netlify Identity for administrator authentication, and Netlify Database (managed PostgreSQL) for app data. Customer pages do not have accounts; administrators create and manage their pages and share the resulting link. It starts with a fresh customer-page database; it does not import accounts, profiles, or photos from an existing MySQL installation.

1. Create or connect the site in Netlify, then provision a Netlify Database for it using the Netlify UI or `netlify database init`.
2. In the Netlify site dashboard, open **Site configuration → Identity** and enable Identity. Verify `https://<your-site>/.netlify/identity/settings` returns JSON (not a 404). Create or invite the site administrator through Identity, and disable public sign-ups in the Identity settings. Customers do not create accounts; administrators create and manage their link pages in TapLink.
3. Connect this repository and deploy using [`netlify.toml`](./netlify.toml). It builds the frontend bundle and deploys the Functions. The publish directory must remain `public`; do not publish the repository root. Netlify must use Node.js 22.12.0 or later.
4. Netlify applies SQL migrations from `netlify/database/migrations/` during deployment, including the customer page table.
5. Sign in once as the administrator so TapLink creates the administrator profile row. In the Netlify Database SQL editor, promote that account; replace the email with the administrator’s email:

   ```sql
   update profiles
   set role = 'admin'
   where lower(email) = lower('admin@example.com');
   ```

6. Sign in again or reload. The admin dashboard can now create customer pages, choose from six designs, publish or edit pages, and copy each customer’s shareable link.

Netlify Identity is used only for administrator sign-in. Keep public registration disabled in the Netlify Identity settings; the site intentionally has no customer signup flow. Customer photos can be provided as HTTPS image URLs. The curated `public` directory keeps PHP sources, database migrations, and local storage files out of Netlify's static publish output.

For local Netlify development, install dependencies and use `netlify dev` with the site linked and its Netlify services provisioned.

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

- Responsive landing page and administrator dashboard for customer pages
- Administrator sign-in and customer-page management (customers do not need accounts)
- Customer profile photo URL, display name, headline, company, and bio
- Link buttons generated from the saved website, Instagram, Facebook, TikTok, LinkedIn, X, YouTube, WhatsApp, Telegram, phone, email, and location fields
- Publish controls, shareable profile URL, dark mode, and public contact-card download
- Six link-page designs: Studio, Noir, Editorial, Orbit, Garden, and Card
- Netlify Identity administrator authentication, Netlify Database persistence, and protected Netlify Function operations

## Important notes

- On Netlify, admins enter customer details and social URLs in the dashboard. A page stays private as a draft until an admin publishes it; anyone with its link can then view the public details and download the contact card.
- Customer photos are entered as HTTPS image URLs. A location becomes a tappable Google Maps link.
- Social URLs become tap-ready page buttons; TapLink does not log in to social networks or request OAuth access.
- Netlify profile URLs use the `?u=slug` query format. A `localhost` profile URL is only reachable from the local computer.
- The XAMPP version remains a separate legacy PHP application and retains its own user-account flow.
- When upgrading, the migration does not delete old scan/template tables or custom-link data. Those legacy data are retained in the database but are no longer shown or used by TapLink.
- Use HTTPS outside local development. Configure the web server and database backups before deploying the application publicly.
