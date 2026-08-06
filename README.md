# Coder Revenue Hub

A single place to trust for ASC 606 revenue: contracts, invoices, deferred revenue,
contract assets, revenue and tax JEs, rollforwards, review sign-off, and
audit-ready exports.

## Accounting policy (built in)

- SSP split default *20% license / 80% support* (overridable per contract).
- **License is recognized point-in-time in the close month** of each contract or
  tranche - including multi-year deals billed annually. The excess of recognition
  over billings is carried as a **contract asset**, relieved by later invoices.
- **Support/PCS is recognized on a daily rate** (`support fee / term days x days in
  month`), penny-exact with a final-month plug. Day count is configurable per
  contract (inclusive or exclusive of the start date) to match legacy schedules.
- Per-contract net balance: cumulative billings less cumulative recognition.
  Positive = deferred revenue; negative = contract asset. Invoices relieve the
  contract asset first; recognition relieves deferred revenue first.
- Sales tax on invoices books AR gross with a credit to Sales Tax Payable.
- **Campfire is the billing source of truth** - every invoice carries a Campfire
  reference for reconciliation.

The engine is verified against the legacy Wayve tranched schedule and CSSF
contract asset workbook: `npx tsx scripts/verify-engine.ts`.

## Features

- **Contract view** - contracts with invoices as children, expandable inline.
- **Invoice view** - flat list; contract is a data point on the line.
- Tranched, tiered and flat billing models; draft invoice generation from the
  billing schedule.
- Labels on contracts and invoices; filters everywhere; everything editable.
- **Review workflow** with segregation of duties: preparers submit, reviewers
  approve, nobody approves their own work. Edits to approved items reopen them.
  Full audit log on every change.
- **Rollforward** screen: deferred revenue and contract asset by month, expandable
  to by-contract detail.
- **Journal entries** computed per month (billings + recognition), balance-checked.
- **Exports**: audit-ready Excel workbook (summary, DR rollforward, CA rollforward,
  revenue by contract, JEs, invoice register, per-customer schedules) and a
  NetSuite journal-import CSV.

## Deploy (Vercel + Neon)

1. **Neon**: create a project at neon.tech, copy the connection string.
2. Locally:
   ```bash
   npm install
   cp .env.example .env    # paste DATABASE_URL, set a random AUTH_SECRET
   npm run db:push         # creates the schema in Neon
   npm run dev             # http://localhost:3000
   ```
3. **Vercel**: push this folder to a Git repo, import it in Vercel, and set the
   `DATABASE_URL` and `AUTH_SECRET` environment variables. Deploy.
4. Open the app - it will walk you through creating the first **admin** account,
   then add your preparers and reviewers in Settings.

## Suggested workflow for the migration

You said you want to key contracts in manually while reviewing each one - the app
is built for that:

1. Create the contract from the signed agreement (not the spreadsheet).
2. Add tranches for ramp deals (seats x price autosuggests the amount).
3. Enter invoices from Campfire with their Campfire refs (or generate drafts and
   correct them against Campfire).
4. Check the Schedule tab ties to your legacy workbook.
5. Submit for review; a reviewer approves.
6. Label as you go (e.g. "FY26 migrated", "Needs Campfire recon").

## Stack

Next.js 15 (App Router) / Neon Postgres via Drizzle ORM / Tailwind v4 /
ExcelJS exports / JWT session auth (bcrypt + jose).
