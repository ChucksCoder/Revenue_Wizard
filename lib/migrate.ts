import { neon } from "@neondatabase/serverless";

/**
 * Idempotent schema bootstrap. Runs automatically from /setup so no local
 * tooling is needed - safe to call on every setup request.
 * Mirrors drizzle/0000_init.sql with IF NOT EXISTS guards.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "name" text NOT NULL,
    "password_hash" text NOT NULL,
    "role" text DEFAULT 'preparer' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "users_email_unique" UNIQUE("email")
  )`,
  `CREATE TABLE IF NOT EXISTS "customers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "customers_name_unique" UNIQUE("name")
  )`,
  `CREATE TABLE IF NOT EXISTS "contracts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "customer_id" uuid NOT NULL,
    "name" text NOT NULL,
    "contract_number" text,
    "billing_model" text DEFAULT 'flat' NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "tcv" numeric(14, 2) DEFAULT '0' NOT NULL,
    "license_pct" numeric(6, 4) DEFAULT '0.2' NOT NULL,
    "billing_frequency" text DEFAULT 'annual' NOT NULL,
    "day_count" text DEFAULT 'inclusive' NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "review_status" text DEFAULT 'draft' NOT NULL,
    "prepared_by_id" uuid,
    "prepared_at" timestamp,
    "approved_by_id" uuid,
    "approved_at" timestamp,
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "tranches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "contract_id" uuid NOT NULL,
    "name" text NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "seats" integer,
    "price_per_seat" numeric(12, 2),
    "amount" numeric(14, 2) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "notes" text
  )`,
  `CREATE TABLE IF NOT EXISTS "invoices" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "contract_id" uuid NOT NULL,
    "invoice_number" text NOT NULL,
    "invoice_date" date NOT NULL,
    "period_start" date,
    "period_end" date,
    "amount" numeric(14, 2) NOT NULL,
    "tax_rate" numeric(7, 5) DEFAULT '0' NOT NULL,
    "tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "review_status" text DEFAULT 'draft' NOT NULL,
    "prepared_by_id" uuid,
    "prepared_at" timestamp,
    "approved_by_id" uuid,
    "approved_at" timestamp,
    "description" text,
    "external_ref" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "labels" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "color" text DEFAULT '#6366f1' NOT NULL,
    CONSTRAINT "labels_name_unique" UNIQUE("name")
  )`,
  `CREATE TABLE IF NOT EXISTS "contract_labels" (
    "contract_id" uuid NOT NULL,
    "label_id" uuid NOT NULL,
    CONSTRAINT "contract_labels_contract_id_label_id_pk" PRIMARY KEY("contract_id","label_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "invoice_labels" (
    "invoice_id" uuid NOT NULL,
    "label_id" uuid NOT NULL,
    CONSTRAINT "invoice_labels_invoice_id_label_id_pk" PRIMARY KEY("invoice_id","label_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "action" text NOT NULL,
    "user_id" uuid,
    "user_name" text,
    "detail" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" jsonb NOT NULL
  )`,
  // FK + hot-path indexes (Postgres doesn't index FKs automatically); these
  // keep list queries fast at thousands of contracts/invoices.
  `CREATE INDEX IF NOT EXISTS "idx_invoices_contract" ON "invoices" ("contract_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_invoices_date" ON "invoices" ("invoice_date")`,
  `CREATE INDEX IF NOT EXISTS "idx_tranches_contract" ON "tranches" ("contract_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_contracts_customer" ON "contracts" ("customer_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_log" ("entity_id")`,
];

const FOREIGN_KEYS: [string, string][] = [
  ["audit_log_user_id_users_id_fk", `ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id")`],
  ["contract_labels_contract_id_contracts_id_fk", `ALTER TABLE "contract_labels" ADD CONSTRAINT "contract_labels_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE cascade`],
  ["contract_labels_label_id_labels_id_fk", `ALTER TABLE "contract_labels" ADD CONSTRAINT "contract_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE cascade`],
  ["contracts_customer_id_customers_id_fk", `ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id")`],
  ["contracts_prepared_by_id_users_id_fk", `ALTER TABLE "contracts" ADD CONSTRAINT "contracts_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id")`],
  ["contracts_approved_by_id_users_id_fk", `ALTER TABLE "contracts" ADD CONSTRAINT "contracts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")`],
  ["invoice_labels_invoice_id_invoices_id_fk", `ALTER TABLE "invoice_labels" ADD CONSTRAINT "invoice_labels_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE cascade`],
  ["invoice_labels_label_id_labels_id_fk", `ALTER TABLE "invoice_labels" ADD CONSTRAINT "invoice_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE cascade`],
  ["invoices_contract_id_contracts_id_fk", `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE cascade`],
  ["invoices_prepared_by_id_users_id_fk", `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id")`],
  ["invoices_approved_by_id_users_id_fk", `ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")`],
  ["tranches_contract_id_contracts_id_fk", `ALTER TABLE "tranches" ADD CONSTRAINT "tranches_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE cascade`],
];

let migrated = false;

export async function ensureSchema(): Promise<void> {
  if (migrated) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - connect your Neon database to the Vercel project.");
  }
  const sql = neon(process.env.DATABASE_URL);
  for (const stmt of STATEMENTS) {
    await sql.query(stmt);
  }
  for (const [name, stmt] of FOREIGN_KEYS) {
    const exists = await sql.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [name]
    );
    if ((exists as unknown[]).length === 0) {
      await sql.query(stmt);
    }
  }
  migrated = true;
}
