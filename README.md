# Bitz Designs Invoice Creator

Internal invoice creator for **Bitz Designs**.

The UI is a React + Vite + TypeScript frontend. A Cloudflare Worker serves `/api/*` and stores data in D1.

People, settings, and saved invoices live in D1. The editor also keeps an unsaved working copy in `localStorage` so a reload does not wipe a draft. That working copy is not the saved invoice.

## Prerequisites

- Node.js 20.19+ (22.12+ also works)
- npm
- A Cloudflare account
- Wrangler authentication (`npx wrangler login` if `npx wrangler whoami` is not already logged in)

## Install

```bash
npm install
```

## Cloudflare D1

Database name:

```text
bitz-designs-invoicing
```

Binding name:

```text
DB
```

Local `npm run dev` uses a local D1 database under `.wrangler/`. It does not write to the hosted database.

Apply migrations locally:

```bash
npx wrangler d1 migrations apply bitz-designs-invoicing --local
```

If you need to create the database on a new account:

```bash
npx wrangler d1 create bitz-designs-invoicing
```

Then paste the returned `database_id` into `wrangler.jsonc` under `d1_databases[0].database_id`.

List existing databases:

```bash
npx wrangler d1 list
```

After changing Wrangler bindings, regenerate Worker types:

```bash
npm run cf-typegen
```

### Apply schema migrations to production D1

Read the files in `migrations/` first. `0011_company_scope.sql` makes invoice numbers unique per company, scopes email idempotency to the invoice, and adds `company_secrets` for encrypted Stripe and SMTP credentials.

```bash
npx wrangler d1 migrations apply bitz-designs-invoicing --remote
```

### Invoice numbering and year rollover

The sequence lives in `invoice_sequences` and is incremented atomically with `UPDATE … RETURNING` in D1. That is the source of truth — not `localStorage`, and not the browser.

The sequence **does not reset on January 1**. Include-year only changes the formatted string (`BD` + `2026` + `-` + `0051` → `BD2026-0051`). Resetting yearly would risk collisions if include-year is later turned off. Assigned invoice numbers are never rewritten when numbering settings change.

## Secrets

Company Stripe and SMTP passwords can be saved in Settings. They are encrypted with `TENANT_SECRETS_KEY` and stored in `company_secrets`. The API never returns the secret values.

If a company has not saved its own credential, the Worker uses the platform secret of the same kind.

```bash
npx wrangler secret put TENANT_SECRETS_KEY
npx wrangler secret put SMTP_PASSWORD
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put PAYMENT_LINK_KEY
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ONBOARD_INVITE_CODE
```

`TENANT_SECRETS_KEY` is a base64-encoded 32-byte key:

```bash
openssl rand -base64 32
```

`ACCESS_TEAM_DOMAIN` is the Cloudflare Access team host, such as `your-team.cloudflareaccess.com`. `ACCESS_AUD` is the Access application audience tag. Production requests to `invoice.vrfnw.com` require a verified Access JWT. Localhost does not. Set `DEV_ACCESS_EMAIL` in `.dev.vars` (the default is `dev@localhost`).

`ONBOARD_INVITE_CODE` is required to create a company on a non-local host. Leave it unset for local development, or set it and type the same code on the setup screen.

For local `npm run dev`, put the same names in a gitignored `.dev.vars` file. Start from `.dev.vars.example`. Do not commit `.dev.vars`.

Port 25 is rejected. Use 465, 587, or 2525. `POST /api/settings/smtp/test` sends a real test email.

## Hostnames

| Host | Role |
|---|---|
| `invoice.vrfnw.com` | Private admin SPA + admin APIs (Cloudflare Access) |
| `pay.vrfnw.com` | Public card payment only (`/i/:token`, `/api/public/*`, Stripe webhook, read-only branding file) |
| `*.workers.dev` | Disabled (`workers_dev: false`) and Worker-locked so it cannot bypass Access |
| `localhost` | Full local development |

The Worker enforces hostname access **before** SPA asset fallback. Visiting `https://pay.vrfnw.com/` shows a neutral payment landing page, not the admin dashboard.

### Cloudflare Access (required for payments)

Access must protect **`invoice.vrfnw.com` only**.

On **`pay.vrfnw.com`**, bypass Access for at least:

- `/i/*`
- `/api/public/*`
- `/api/webhooks/stripe`
- `/api/branding/file/*`
- `/assets/*`
- `/branding/*`
- `/fonts/*`

If Access also covers `pay.vrfnw.com`, the payment page can sit on **Loading invoice…** forever (browser Access cookies interfere with `/api/public/*`). Public payment fetches use `credentials: 'omit'` as a safeguard, but path bypasses are still required.

## Local development

```bash
npm run dev
```

This starts the Cloudflare Vite dev server (typically `http://localhost:5173`). Frontend requests to `/api/*` are handled by the Worker in the same origin.

Health checks:

- `GET /api/health` — Worker process is up
- `GET /api/health/db` — Worker can run `SELECT 1` against D1
- `GET/POST /api/people` and `GET/PUT/DELETE /api/people/:id` — saved people
- `GET /api/settings` — aggregated settings (defaults, numbering, branding, SMTP)
- `PUT /api/settings/defaults` — invoice field defaults (including Default From)
- `GET/PUT /api/settings/numbering` and `POST /api/settings/numbering/next`
- `POST /api/invoices/allocate-number` — atomic D1 invoice number
- `GET /api/settings/branding` — current branding paths
- `POST /api/settings/branding/:kind` and `POST /api/settings/branding/:kind/restore` — upload/replace or restore built-in
- `GET /api/branding/file/:key` — serve an uploaded branding file
- `GET/PUT /api/settings/smtp` and `POST /api/settings/smtp/test` (no password in responses)
- `GET/POST /api/invoices` and `GET/PUT/DELETE /api/invoices/:id` — saved invoices (delete is draft-only)
- `POST /api/invoices/:id/mark-paid` and `POST /api/invoices/:id/void` — status transitions
- `GET /api/public/invoices/:token` and `POST /api/public/invoices/:token/payment-intent` — public payment page
- `POST /api/webhooks/stripe` — Stripe PaymentIntent finalization (signature required)

## Stripe payments and webhooks

Card payment on the public page (`/i/:token`) uses Stripe Payment Element. Creating a PaymentIntent does **not** mark the invoice paid. The Worker endpoint `POST /api/webhooks/stripe` is authoritative:

1. Reads the raw request body
2. Verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` (HMAC SHA-256, 5-minute tolerance)
3. Handles `payment_intent.succeeded` (mark paid), plus `payment_intent.payment_failed` / `payment_intent.canceled` (audit only)
4. Recalculates the expected card total from the saved invoice snapshot and compares amount/currency
5. Writes `invoice_payments`, sets `paid_method` from the method Stripe reports (`card`, `apple_pay`, `google_pay`, or `ach`), stores the PaymentIntent id and amount paid, and revokes the public token

Do not process unsigned JSON. Do not trust Stripe metadata for the charge amount.

**Race with admin Mark Paid:** if an admin marks the invoice paid at about the same time Stripe succeeds, `paid_method` / `paid_at` stay as the admin set them. The Stripe payment is still recorded in `invoice_payments`, receipt fields are attached with `COALESCE`, and the token is revoked. Void invoices are never un-voided.

A company can save its own Stripe secret key and webhook signing secret in Settings. Otherwise the Worker uses `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

Forward events with the Stripe CLI while `npm run dev` is running:

```bash
stripe listen --forward-to localhost:5173/api/webhooks/stripe
```

Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`. Optionally trigger:

```bash
stripe trigger payment_intent.succeeded
```

Cloudflare Access must allow unauthenticated access to `/i/*`, `/api/public/*`, and `POST /api/webhooks/stripe`.

### Apple Pay and Google Pay

The public pay page (`pay.vrfnw.com/i/:token`) shows Stripe’s Express Checkout buttons for Apple Pay and Google Pay above the card form. Stripe decides which button to show from the browser:

- Safari on a Mac, iPhone, or iPad: Apple Pay
- Chrome on a computer or Android: Google Pay

The card form stays as the fallback. Wallet payments are card payments, so they include the card processing fee. ACH does not. The webhook still marks the invoice paid, and records `paid_method` as `apple_pay` or `google_pay`.

Before wallets work in production:

1. In the Stripe Dashboard, open **Settings → Payment methods** and turn on Apple Pay and Google Pay.
2. Under **Payment method domains**, register `pay.vrfnw.com`. The Worker already serves `/.well-known/apple-developer-merchantid-domain-association` on that host, which is what Apple Pay domain verification checks.
3. If a company saves its own Stripe secret key, repeat both steps on that Stripe account. Domain verification is per Stripe account, not just the platform account.

Webhook/payment schema is `migrations/0008_stripe_webhook_payments.sql`. After reviewing it, apply **only** with:

```bash
npx wrangler d1 migrations apply bitz-designs-invoicing --remote
```

## Tests

```bash
npm test
```

Runs unit tests for money parsing, dates, invoice calculations, defaults snapshots, numbering, branding uploads (mocked), SMTP settings, and invoice status transitions. Tests mock D1/R2 and never write to the remote database or send email.

## Invoice PDF and print

Download PDF and Print use the **same canonical invoice document** as Preview and the Invoices detail modal (`InvoiceDocument`). There is no separate PDF template.

Saved-invoice PDF download, preview PDF generation, and invoice email attachments all use Worker-side HTML rendering plus Cloudflare Browser Rendering / `@cloudflare/puppeteer` to produce the PDF (letter size, 0.5 in margins). Credit-card fees are never added to the printed invoice total.

Saved-invoice downloads use the D1 snapshot already loaded in the modal. Unsaved Preview downloads are labeled `Invoice-…-DRAFT.pdf` and do not save to D1.

## Production build

```bash
npm run build
```

This typechecks the frontend, Worker, and Vite config, then builds a Cloudflare Worker with static assets.

The build is configured to strip local secret files such as `.dev.vars` and `.env*` from generated output. Local secrets must stay in your working copy or Wrangler secrets, never in `dist/`.

Preview the production build locally:

```bash
npm run preview
```

`npm run preview` does not apply migrations. `GET /api/health/db` checks that D1 answers `SELECT 1`.

## Branding assets

Built-in files live in the repository:

```
public/branding/bitz-designs-wordmark.png   Site wordmark
public/branding/bitz-designs-icon.png       Site icon, favicon, and default invoice logo
```

Settings → Branding can **upload/replace each asset independently**, or Restore default (the files above). Uploads are stored in the R2 bucket `bitz-designs-branding` (binding `BRANDING`). D1 stores only the path, never image bytes.

Create the bucket if it does not exist:

```bash
npx wrangler r2 bucket create bitz-designs-branding
```

Enable R2 in the Cloudflare Dashboard first if that command fails.

New invoices snapshot the current invoice-logo path. Historical invoices keep the path they were saved with.

## Project structure

```
public/branding/             Branding images served as static assets
worker/                      Cloudflare Worker API (`/api/*`)
migrations/                  Versioned D1 schema migrations
wrangler.jsonc               Worker, assets, D1, R2, and Browser Rendering
src/
  types/invoice.ts           Invoice data model
  types/person.ts            Saved people
  data/defaultInvoice.ts     Empty/reset invoice values
  directory/                 People list + default From setting
  invoice/InvoiceDraftContext.tsx  Live draft state + localStorage
  utils/money.ts             Integer-cents money helpers
  utils/invoiceCalculations.ts  Subtotal, totals, card-fee math
  utils/invoiceValidation.ts Inline editor validation
  utils/invoiceStorage.ts    Draft load/save/sanitize
  components/invoices/       Saved invoice list
  components/editor/         Invoice editor sections
  components/InvoicePreview.tsx  Live print-style invoice preview
  theme/ThemeProvider.tsx    Light/dark theme
```

## Notes

- The admin UI supports light and dark themes. The preference is stored in `localStorage` under `bitz-designs-theme`. On first visit, the operating-system color scheme is used.
- The current invoice draft is stored in `localStorage` under `bitz-designs-invoice-draft` as crash recovery only. A recovered draft is not overwritten with Settings defaults on startup. **New Invoice** / **Reset Invoice** snapshot the current defaults (From person, Zelle, fees, currency, memo, due days, notes, country, invoice logo) and allocate a number from D1.
- Settings categories: Defaults, Email / SMTP, Payments, Branding, Invoice Numbering, and Format.
- If the Default From person is deleted, the setting is cleared. Existing invoices keep the From snapshot they already stored.
- Selecting a person copies their details into the invoice. Saved D1 invoices store that snapshot and do not change when the People record changes later.
- Explicit **Save invoice** writes to D1.
- The invoice preview is always a white document with dark text, regardless of the admin theme.
- Invoice totals use integer cents. The printed invoice and the Zelle amount do not include a card fee. The card total is calculated separately when the customer pays.
