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

Invoice tables are in `migrations/0002_create_invoices.sql`. After reviewing that file, apply it with the same command (Wrangler applies pending migrations in order).

## Local development

```bash
npm run dev
```

This starts the Cloudflare Vite dev server (typically `http://localhost:5173`). Frontend requests to `/api/*` are handled by the Worker in the same origin.

Health checks:

- `GET /api/health` — Worker process is up
- `GET /api/health/db` — Worker can run `SELECT 1` against remote D1
- `GET/POST /api/people` and `GET/PUT/DELETE /api/people/:id` — saved people
- `GET/PUT /api/settings` — application settings, currently Default From
- `GET/POST /api/invoices` and `GET/PUT/DELETE /api/invoices/:id` — saved invoices (delete is draft-only)

## Tests

```bash
npm test
```

Runs unit tests for money parsing, dates, and invoice calculations.

## Production build

```bash
npm run build
```

This typechecks the frontend, Worker, and Vite config, then builds a Cloudflare Worker with static assets.

Preview the production build locally:

```bash
npm run preview
```

Do not use `npm run preview` as a substitute for remote D1 verification; the health/db endpoint is the check for database reachability.

## Branding assets

Place the supplied Bitz Designs images here:

- `public/branding/bitz-designs-wordmark.png` — full wordmark, used in the admin header
- `public/branding/bitz-designs-icon.png` — compact icon, used in the sidebar, invoice document, and favicon

Do not recreate the logo in CSS or SVG. Use these image files as supplied.

The compact icon is configured as the site favicon in `index.html`.

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
- The current invoice draft is stored in `localStorage` under `bitz-designs-invoice-draft`. Malformed data falls back to defaults. **Reset Invoice** restores a blank draft after confirmation, filling From from Settings if a default person is set.
- Saved people and Default From live in remote D1 via `/api/people` and `/api/settings`. If the Default From person is deleted, the setting is cleared.
- Selecting a person copies their details into the invoice. Saved D1 invoices store that snapshot and do not change when the People record changes later.
- Invoice drafts remain in `localStorage` under `bitz-designs-invoice-draft` as a working copy only. Explicit **Save invoice** writes to D1.
- The invoice preview is always a white document with dark text, regardless of the admin theme.
- The invoice document uses only the compact icon. The full wordmark is reserved for the website/admin chrome.
- Invoice totals use integer cents. The invoice/Zelle total is never increased by a credit-card fee; the card total is a separate calculation for a later Stripe phase.
