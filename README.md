# Bitz Designs Invoice Creator

Internal invoice creator for **Bitz Designs**.

The UI is a React + Vite + TypeScript frontend. A Cloudflare Worker serves `/api/*` and uses a remote D1 database.

People, Settings, and **saved invoices** are stored in remote D1. The editor also keeps an unsaved working copy in `localStorage` for crash/reload recovery. That working copy is not the source of truth for saved invoices.

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

The Wrangler config sets `"remote": true` on this binding. Local `npm run dev` still runs the Worker on your machine, but D1 queries go to the **real hosted database**, not a local SQLite file.

**Warning:** local development writes to the actual remote D1 database. Treat it as shared/live data.

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

### Apply schema migrations to REMOTE D1

This writes to the hosted database. Review `migrations/0001_create_people_and_settings.sql` first, then run:

```bash
npx wrangler d1 migrations apply bitz-designs-invoicing --remote
```

Do not omit `--remote`. Without it, Wrangler would apply the migration to a local SQLite file instead of the real D1 database.

Invoice tables are in `migrations/0002_create_invoices.sql`. Settings numbering columns are in `migrations/0003_settings_numbering_branding.sql`. Static invoice-logo path plus paid/void metadata are in `migrations/0004_invoice_status_and_static_logo.sql`. After reviewing those files, apply pending migrations with the same command (Wrangler applies them in order).

**Do not apply a remote migration until you have reviewed it.** The command is:

```bash
npx wrangler d1 migrations apply bitz-designs-invoicing --remote
```

### Invoice numbering and year rollover

The sequence lives in `invoice_sequences` and is incremented atomically with `UPDATE … RETURNING` in D1. That is the source of truth — not `localStorage`, and not the browser.

The sequence **does not reset on January 1**. Include-year only changes the formatted string (`BD` + `2026` + `-` + `0051` → `BD2026-0051`). Resetting yearly would risk collisions if include-year is later turned off. Assigned invoice numbers are never rewritten when numbering settings change.

## SMTP password (Worker secret)

Non-secret SMTP settings (host, port, username, security, From name/email, Reply-To) are stored in D1 via the settings table.

The SMTP password is **not** stored in D1 and is **never** returned by the API. Set it as a Worker secret:

```bash
npx wrangler secret put SMTP_PASSWORD
```

For local `npm run dev`, put the same name in a gitignored `.dev.vars` file:

```text
SMTP_PASSWORD=your-local-dev-secret
```

Use `.dev.vars.example` as the placeholder template for local setup. Do not commit `.dev.vars` or real credentials. The GUI can show `passwordConfigured: true` only. Replacing the secret is done with the same Wrangler command — not through the API.

Port 25 is rejected. Use 465 (SSL / implicit TLS), 587 (STARTTLS), or 2525. The settings are provider-independent (Brevo, SMTP2GO, or any standard SMTP service). `POST /api/settings/smtp/test` sends a real test email, and `POST /api/invoices/:id/send` sends the real invoice email with a PDF attachment.

## Local development

```bash
npm run dev
```

This starts the Cloudflare Vite dev server (typically `http://localhost:5173`). Frontend requests to `/api/*` are handled by the Worker in the same origin.

Health checks:

- `GET /api/health` — Worker process is up
- `GET /api/health/db` — Worker can run `SELECT 1` against remote D1
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
5. Writes `invoice_payments`, sets `paid_method = card`, stores the PaymentIntent id and amount paid, and revokes the public token

Do not process unsigned JSON. Do not trust Stripe metadata for the charge amount.

**Race with admin Mark Paid:** if an admin marks the invoice paid at about the same time Stripe succeeds, `paid_method` / `paid_at` stay as the admin set them. The Stripe payment is still recorded in `invoice_payments`, receipt fields are attached with `COALESCE`, and the token is revoked. Void invoices are never un-voided.

Set Worker secrets (never commit them, never store in D1):

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put PAYMENT_LINK_KEY
```

Local `.dev.vars` (gitignored):

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYMENT_LINK_KEY=...
```

You can start from `.dev.vars.example`, then create your own gitignored `.dev.vars` with real local-only values.

Forward events with the Stripe CLI while `npm run dev` is running:

```bash
stripe listen --forward-to localhost:5173/api/webhooks/stripe
```

Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`. Optionally trigger:

```bash
stripe trigger payment_intent.succeeded
```

Cloudflare Access must allow unauthenticated access to `/i/*`, `/api/public/*`, and `POST /api/webhooks/stripe`.

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

Do not use `npm run preview` as a substitute for remote D1 verification; the health/db endpoint is the check for database reachability.

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
wrangler.jsonc               Worker, assets, and remote D1 binding
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
- Settings categories: Defaults, Email / SMTP, Branding, Invoice Numbering. Additional categories can be added to `SETTINGS_CATEGORIES`.
- If the Default From person is deleted, the setting is cleared. Existing invoices keep the From snapshot they already stored.
- Selecting a person copies their details into the invoice. Saved D1 invoices store that snapshot and do not change when the People record changes later.
- Explicit **Save invoice** writes to D1.
- The invoice preview is always a white document with dark text, regardless of the admin theme.
- Invoice totals use integer cents. The invoice/Zelle total is never increased by a credit-card fee; the card total is a separate calculation for a later Stripe phase.
