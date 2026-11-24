# HAWA TRADERS — Footwear Stock Management

Footwear stock management and customer ordering application with admin dashboard, customer catalogue, order history and printable invoices. Built with **Node.js / Express**, **PostgreSQL**, and vanilla **HTML / CSS / JavaScript**.

> **Project status:** Admin and customer flows are implemented for local testing. Do not launch publicly until phone ownership verification, password-recovery support, final security review, HTTPS, backups and persistent image storage have been implemented/tested.

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

   ```powershell
   Copy-Item .env.example .env
   ```

4. Update `.env` with your **local** PostgreSQL values (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). Use the existing project database or restore a backup to your local PostgreSQL instance.
5. Create admin credentials in `.env`:

   ```powershell
   node -e "require('bcryptjs').hash('REPLACE_WITH_A_STRONG_PASSWORD', 12).then(console.log)"
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Paste the bcrypt output into `ADMIN_PASSWORD_HASH`, and the random secret into `SESSION_SECRET`. Set `ADMIN_USERNAME` to your desired admin username. Never commit `.env`.
6. Start:

   ```powershell
   npm start
   ```

7. Open http://localhost:3000 and log in.

## Folder overview

- `public/index.html`: Admin dashboard, Products and Orders sections
- `public/billing.html`: Invoice / billing page
- `public/login.html`: Shared login for username / phone number and password
- `public/signup.html`: Phone-based customer signup
- `public/customer.html`: Customer Products and My Orders pages
- `public/js/customer.js`: Customer catalogue, cart, order history and Order Again
- `public/js/script.js`: Dashboard and Product/Stock UI
- `public/js/orders.js`: Order list, filters, edit/delete/complete actions
- `public/js/billing.js`: Invoice rendering
- `public/js/hawa-ui.js`: Custom dialogs and toast notifications
- `public/css/`: Blue-and-white styles and responsive layouts
- `server/server.js`: Express API, login sessions, product/stock/order operations
- `server/db.js`: PostgreSQL connection pool
- `database/migrations/001_normalized_colour_unique.sql`: Normalized product colour index
- `database/migrations/002_customer_accounts.sql`: Customer phone uniqueness and order ownership
- `tests/`: Safe smoke tests and optional isolated-database integration tests

## Automated tests

### Non-destructive smoke checks (recommended first)

```powershell
npm test
```

Runs Node syntax checks, checks local frontend asset references and duplicate element IDs, verifies key dashboard and order markup, and checks that the admin API guard is placed before private routes. **No database connection or modifications are made.**

### Real API / PostgreSQL integration tests — isolated test database ONLY

These tests add, edit, complete and delete **temporary** orders and products. They refuse to run unless you deliberately opt in and provide a separate database name ending with `_test`.

1. Back up your normal database. Create a **separate** database in pgAdmin named exactly `footwear_inventory_test`.
2. Populate this test database with the project schema. The easiest route today is to restore a copy of your existing PostgreSQL custom-format backup into this **new empty database** using pgAdmin's **Restore** action. Never restore onto your normal `footwear_inventory_new` database by mistake. Apply migration 002 in the test copy if it is not yet present.
3. In your **local** `.env` file, add:

   ```env
   TEST_DB_NAME=footwear_inventory_test
   ```

4. In PowerShell (in the project folder) run:

   ```powershell
   $env:RUN_DB_TESTS="YES_I_WANT_TO_TEST"
   npm run test:integration
   Remove-Item Env:RUN_DB_TESTS
   ```

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
- [x] Add separate customer routes, account roles and stock-hidden catalogue responses
- [ ] Add verified phone ownership and secure password-recovery flows before public signup
- [ ] Perform full customer/admin isolation and concurrency tests against the isolated test database

## Git workflow

Implement features on `develop`, test locally, push `develop`, then merge to `main` after verification. Do not copy real `.env` or backups into Git.

## Customer account migration and testing (Milestone 6)

**Back up your real database first.** In pgAdmin, execute `database/migrations/002_customer_accounts.sql` **once against `footwear_inventory_new`**, then run it against the separate `footwear_inventory_test` database. Both databases must have the existing `customers`, `orders`, and `order_items` tables. The migration is additive and repeatable: it creates a normalized unique phone index, adds `orders.customer_id` (nullable for historical/admin orders), and an order index. It refuses to apply if existing customer phone numbers would conflict when formatting characters are removed. Do not discard existing orders.

The shared login at `/` accepts **Username / Phone No.** and **Password**. Only a recognized account type is routed to its corresponding dashboard. New customers register at `/signup` using a phone number, shop name and address. Customer pages are at `/customer`. A customer-only API never returns stock quantity; it checks requested quantities **transactionally when an order is placed**. Customer order statuses are **Yet to Receive** when admin status is `Pending`, and **Received** when admin status is `Completed` (treated as delivered for now). "Order Again" copies items into a new draft and requires fresh confirmation; it does not charge or reserve stock when clicked. Customer order editing after submission is not enabled.

**Customer contact:** Set `BUSINESS_CONTACT_PHONE` in your local `.env` when the client supplies a business number. Without it, Contact Us displays an honest placeholder; no number is invented.

After running the migration in both databases:

```powershell
npm test
$env:RUN_DB_TESTS="YES_I_WANT_TO_TEST"
npm run test:integration
Remove-Item Env:RUN_DB_TESTS
```

The integration tests refuse to run unless `TEST_DB_NAME` ends with `_test` and differs from `DB_NAME`. Check the schema **before** running integration tests. Run `npm start` and manually test both account roles, a successful and a failed customer order, delivered status after admin Complete, Order Again, logout, mobile layouts and Contact Us.

## Deployment and recovery essentials

The server's `/healthz` endpoint checks database availability. Production requires HTTPS for secure session cookies and an absolute, existing, writable `IMAGE_UPLOAD_DIR` pointing to persistent storage. Configure `DB_SSL_MODE=require` and the PostgreSQL CA chain as appropriate for the host. Do not allow raw database backups, `.env`, or private uploads to be served publicly.

Use `pg_dump` to create **private** backups and `pg_restore` to test them in a separate database; test a restore regularly. Example (replace the host, database and destination with your local private values):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -Fc -d footwear_inventory_new -f "C:\private-backups\footwear.backup"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list "C:\private-backups\footwear.backup"
```

A successful listing is not a complete recovery test; actually restore into an isolated, disposable database and validate table counts and a sample read. The website remains **development-only** until client-approved phone verification, password recovery, security and deployment testing are completed.

## Inventory matrix + brands/tags (Milestone 7.1)

This version replaces the three single-size admin forms with **one reusable matrix**. Product creation accepts brand/company, optional tags, multiple colours (each with a different photo), and user-added numeric sizes. Add Colour adds one or more new colours and their sizes. Add Stock accepts multiple sizes for existing colours in a single save; input quantities **increase** current stock rather than replacing it. The existing single-row API endpoints remain for backward compatibility, but the main admin page now uses `POST /api/inventory/bulk`.

Run `database/migrations/003_inventory_matrix_brand_tags.sql` against the **isolated test database first**, after confirming `SELECT current_database()`. It only adds `products.brand` and a `product_tags` table/index and does not alter orders or existing stock. Back up the development database before applying the same migration there. Both admin and customer catalogues can show brand and tags, but the customer API still does **not** return stock quantities.

Do not test stock edits on `footwear_inventory_new` until migration and manual testing pass on `footwear_inventory_test`. The bulk endpoint validates duplicate sizes/colours and commits all changes in a single PostgreSQL transaction. Each image is validated by its file signature; failed transactions remove uploaded images. The image storage provider is not changed by this milestone.

Check from project root:

```powershell
npm test
$env:RUN_DB_TESTS='YES_I_WANT_TO_TEST'
npm run test:integration
Remove-Item Env:RUN_DB_TESTS
```

The integration tests need `TEST_DB_NAME=footwear_inventory_test` in the local `.env`, both database migrations `002` and `003` already applied to that test database, and a working PostgreSQL instance. They use a temporary test image directory and remove their own fixtures. Review `INSTALL_MILESTONE7_MATRIX.md` for detailed steps and manual verification.


## Sales analytics (Milestone 7.4)

After backing up the database, run `database/migrations/004_sales_reporting_dates.sql`
first in `footwear_inventory_test`, then in your development database once tests pass.
This additive migration gives **new orders** a creation date and records a delivery
time when an admin marks an order Completed. Historical orders are **not assigned
invented dates**; their `created_at` and `completed_at` remain `NULL`.

The admin-only **ANALYTICS** sidebar page reports all-time delivered order
volumes by brand, art number, footwear size and shop, using saved order-item
prices for monetary values. Pending orders do not count as sales. Previously
recorded unpriced lines are omitted from the sales-value calculation and shown
as a warning. Historical manual shop names remain separate from authenticated
customer accounts to avoid merging unrelated shops. The 8-week trend starts
tracking deliveries only after migration 004; all-time reports still include
older Completed orders.

The customer catalogue can display **Popular with shops** on up to three
articles with at least three delivered orders. It never sends stock counts,
shop identities, or order counts to the customer's browser. This is an
all-time popularity label, not a claim about recent trends or percentage of
shops ordering. True dated trend badges need sufficient real delivery history.
