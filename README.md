# HAWA TRADERS — Footwear Stock Management

Admin-facing web application for footwear catalogue, stock management, orders and printable invoices. Built with **Node.js / Express**, **PostgreSQL**, and vanilla **HTML / CSS / JavaScript**.

> **Project status:** The admin workflow is implemented. Customer accounts and the customer dashboard are planned for a later milestone. Do not deploy publicly before completing a production security review and configuring HTTPS, backups and persistent image storage.

## Requirements

- Node.js 20 or newer
- PostgreSQL 18 (current local development setup; another supported version may work)
- Git (optional)
- pgAdmin or PostgreSQL command-line tools

## Local setup (Windows / PowerShell)

1. Clone the repository, or open your existing `footwear-stock-management` folder in VS Code.

2. Install dependencies:

   ```powershell
   npm ci
   ```

3. Copy `.env.example` to `.env`:

   in powershell, run:

   Copy-Item .env.example .env
   

4. Update `.env` with your **local** PostgreSQL values (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). Use the existing project database or restore a backup to your local PostgreSQL instance.

5. Create admin credentials in `.env`:

   in powershell, run:

   node -e "require('bcryptjs').hash('REPLACE_WITH_A_STRONG_PASSWORD', 12).then(console.log)"
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   

   Paste the bcrypt output into `ADMIN_PASSWORD_HASH`, and the random secret into `SESSION_SECRET`. Set `ADMIN_USERNAME` to your desired admin username. Never commit `.env`.

6. Start:

   in powershell, run:

   npm start
   

7. Open http://localhost:3000 and log in.

## Folder overview

- `public/index.html`: Admin dashboard, Products and Orders sections
- `public/billing.html`: Invoice / billing page
- `public/login.html`: Admin login page

- `public/js/script.js`: Dashboard and Product/Stock UI
- `public/js/orders.js`: Order list, filters, edit/delete/complete actions
- `public/js/billing.js`: Invoice rendering
- `public/js/hawa-ui.js`: Custom dialogs and toast notifications

- `public/css/`: Styles and responsive layouts

- `server/server.js`: Express API, login sessions, product/stock/order operations
- `server/db.js`: PostgreSQL connection pool

- `database/migrations/001_normalized_colour_unique.sql`: Applied/retained database migration

- `tests/`: Safe smoke tests and optional isolated-database integration tests

## Automated tests

### Non-destructive smoke checks (recommended first)

in powershell, run:

npm test


Runs Node syntax checks, checks local frontend asset references and duplicate element IDs, verifies key dashboard and order markup, and checks that the admin API guard is placed before private routes. **No database connection or modifications are made.**

### Real API / PostgreSQL integration tests — isolated test database ONLY

These tests add, edit, complete and delete **temporary** orders and products. They refuse to run unless you deliberately opt in and provide a separate database name ending with `_test`.

1. Back up your normal database. Create a **separate** database in pgAdmin named exactly `footwear_inventory_test`.

2. Populate this test database with the project schema. The easiest route today is to restore a copy of your existing PostgreSQL custom-format backup into this **new empty database** using pgAdmin's **Restore** action. Never restore onto your normal `footwear_inventory_new` database by mistake. The existing migration can be run against the test copy if necessary.

3. In your **local** `.env` file, add:

   TEST_DB_NAME = footwear_inventory_test
   

4. In PowerShell (in the project folder) run:

   in powershell, run:

   $env:RUN_DB_TESTS="YES_I_WANT_TO_TEST"
   npm run test:integration
   Remove-Item Env:RUN_DB_TESTS
   

These tests launch a second server on an available local port with an independent admin account and session secret, and connect it only to `TEST_DB_NAME`. They first check `SELECT current_database()` before inserting any fixtures. They exercise authentication, stock deductions, historical price preservation, order edits, rollback, deletes and completed-order protections. They remove their own fixtures afterward, even when a test fails. The normal database is not modified by this suite.

**If you don't have a separate restored test database yet, skip this command.** Do not set `TEST_DB_NAME` equal to your normal DB.

## Database backups and migrations

- Keep `database/migrations/001_normalized_colour_unique.sql` in Git even after running it. It records a schema change.
- Keep backups containing customer/order/session data **outside the repository**. `.gitignore` excludes common backup names, but still verify `git status` before committing.
- A PostgreSQL custom-format backup may have a `.sql` filename yet still need pgAdmin Restore or `pg_restore`, not the plain SQL Query Tool.
- To verify a custom backup's archive header using PostgreSQL 18 tools:

  ```powershell
  & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list "C:\path\to\your_backup.sql"
  ```

- A successful archive listing is **not** the same as a successful full restore. Verify a restore in the separate test database.

## Security and deployment checklist

- [ ] Verify auth and logout with a separate test account
- [ ] Use HTTPS in production (required for secure session cookies)
- [ ] Set strong admin password hash and random session secret in hosting environment
- [ ] Configure PostgreSQL connection securely and test connection limits
- [ ] Restrict CORS / validate same-origin write requests before public exposure
- [ ] Replace local image uploads with persistent storage or a configured persistent disk
- [ ] Establish scheduled database backups and regularly test restoring them
- [ ] Keep `.env`, database backups and customer records out of Git
- [ ] Add customer permission separation and perform customer/admin access tests

## Git workflow

Implement features on `develop`, test locally, push `develop`, then merge to `main` after verification. Do not copy real `.env` or backups into Git.
