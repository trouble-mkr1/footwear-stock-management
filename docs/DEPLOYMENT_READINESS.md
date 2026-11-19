# HAWA TRADERS — Milestone 5C: deployment readiness

**Status:** Preparation only. Do not publicly launch this admin-only build yet. Complete the customer dashboard, authorization testing, and final security review first. The backend currently uses one admin account; `/images` still serves images publicly by URL.

## 1. What was added

- `server/db.js` accepts `DB_SSL_MODE=disable` (local) or `require` (verified TLS for remote PostgreSQL). Optional `DB_SSL_CA_BASE64` supplies a provider-specific trusted CA certificate. TLS certificate verification is never disabled.
- `server/server.js` accepts `IMAGE_UPLOAD_DIR`, with a writable, persistent directory for new uploads. Existing images committed in `public/images` remain accessible. Without that variable, localhost behavior is unchanged.
- Public `GET /healthz` checks PostgreSQL connectivity and returns only `{ "status": "ok" }` (HTTP 200) or `{ "status": "unavailable" }` (HTTP 503). It does not report secrets or database names.
- The connection pool uses a configurable `DB_POOL_MAX` and connection/idle timeouts.

## 2. Keep the local application working

On your Windows development computer, keep these settings in `.env`:

```env
NODE_ENV=development
DB_SSL_MODE=disable
# Keep IMAGE_UPLOAD_DIR unset unless you explicitly want local disk storage.
```

Run:

```powershell
npm test
npm start
```

While signed out, open `http://localhost:3000/healthz`. With your database available it should return HTTP 200 and `{"status":"ok"}`. It does not require login. If PostgreSQL is stopped, it should return HTTP 503. Do not assume the dashboard, authentication or writes are functional solely because `/healthz` works.

## 3. Host requirements before deployment

Choose a hosting platform that supports:

1. Node.js 20+ (use its current supported LTS) and `npm ci` to install the dependencies.
2. HTTPS, with the reverse proxy forwarding trustworthy host/protocol headers. Production cookies are `secure` and will not work over plain HTTP.
3. A managed PostgreSQL database with TLS and credentials stored as private environment variables.
4. A **persistent mounted volume** for product uploads (or a later implementation using object storage). The default `public/images` directory is **not persistent** on many application hosts.
5. Secrets (admin hash, password, session secret, database credentials) configured via a private secret manager; never commit `.env`.
6. Automatic encrypted database backups, monitoring, and restore support.

### Production environment variables

Use the following only after obtaining actual host settings:

```env
NODE_ENV=production
PORT=3000
DB_HOST=your-managed-postgres-host
DB_PORT=5432
DB_NAME=your-production-database
DB_USER=your-production-user
DB_PASSWORD=provided-secret
DB_SSL_MODE=require
DB_POOL_MAX=10
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD_HASH=generated-bcrypt-hash
SESSION_SECRET=long-random-secret
IMAGE_UPLOAD_DIR=/mnt/persistent-footwear-images
```

- If the database provider uses a private root certificate, set `DB_SSL_CA_BASE64` to the Base64-encoded PEM contents provided by the host. Do not set `rejectUnauthorized: false` as a shortcut.
- `IMAGE_UPLOAD_DIR` **must** point to the mounted persistent volume, not a throwaway directory inside the container. For production, the mounted folder **must already exist** and be readable/writable before the app starts; otherwise startup fails. The app cannot verify that the path is genuinely mounted or persistent, so test persistence through a redeploy.
- For Windows *local* testing with a custom upload directory, an example is `IMAGE_UPLOAD_DIR=C:/footwear-storage/images`. Do not put uploaded customer images into `.git`.
- Current images in `public/images` are still accessible as fallback assets. For a future deployment you should **copy old images to the mounted volume**, keep their database filenames unchanged, and verify each renders after a redeploy. Do not rename them casually.
- If there are several app instances, each one needs to see the same uploaded-image store. A single-instance persistent disk cannot serve multiple isolated replicas.
- The app already enables Express `trust proxy` in production and uses HTTPS-only cookies. Confirm your platform's actual proxy topology before exposing the app; do not blindly trust unverified forwarding headers.
- `connect-pg-simple` uses a table named `user_sessions` in PostgreSQL. Its schema must be present, and the account must have permission to read/write that table. Application startup alone does not verify the complete schema.

**Example startup:** `npm ci` followed by `npm start`. Configure the host's health probe to `GET /healthz`.

## 4. Backup and recovery procedure

**Never restore a backup onto your active database to test it.** Keep backups outside the Git repository; they contain sensitive order, customer and session information.

Using PostgreSQL 18 command-line tools on Windows:

```powershell
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
& "$pgbin\pg_dump.exe" -h localhost -p 5432 -U postgres -d footwear_inventory_new -F c -f "C:\secure-backups\footwear-$stamp.dump"
```

The command may prompt for a password. Do not put the password into your command history or source code. Restrict access to the backup directory and encrypt retained backups. For scheduled backups, use your provider's managed backup system rather than an exposed shell script.

Check that the archive is readable (this is not a complete restore test):

```powershell
& "$pgbin\pg_restore.exe" --list "C:\secure-backups\footwear-YYYYMMDD-HHMMSS.dump"
```

To verify a **full restore**, create a *new empty* database, for example `footwear_restore_check`, and restore into that database (never `footwear_inventory_new`):

```powershell
& "$pgbin\createdb.exe" -h localhost -p 5432 -U postgres footwear_restore_check
& "$pgbin\pg_restore.exe" -h localhost -p 5432 -U postgres --no-owner --no-privileges -d footwear_restore_check "C:\secure-backups\footwear-YYYYMMDD-HHMMSS.dump"
```

Check the restore process exit code and any warnings, compare table/row counts, inspect indexes and constraints, and run the read-only queries in `database/checks/001_readonly_integrity.sql`. A successful `--list` is not proof of recoverability.

Before production launch, decide backup frequency, retention, access permissions, offsite copies and a recurring restore drill.

## 5. Final prelaunch requirements

- [ ] Complete customer dashboard and user-specific permissions.
- [ ] Add anti-CSRF/origin protections for state-changing authenticated routes and review cookie domain/host settings.
- [ ] Review login rate limits and access logs for the real reverse-proxy configuration.
- [ ] Validate image contents fully, not only magic-byte signatures, and secure image access if the catalogue isn't meant to be public.
- [ ] Ensure production database schema and migrations match the application; never upload a real-data test backup to a public environment.
- [ ] Provision managed HTTPS, production secrets, verified TLS to PostgreSQL, and an image mount.
- [ ] Test a full redeploy while keeping new uploaded images and PostgreSQL sessions intact.
- [ ] Set up backups, restore tests, monitoring and alerting.
- [ ] Run smoke and isolated integration tests again after all production changes.
