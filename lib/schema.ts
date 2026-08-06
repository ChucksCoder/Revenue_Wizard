import {
  pgTable,
  text,
  timestamp,
  date,
  numeric,
  integer,
  jsonb,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "preparer", "reviewer"] })
    .notNull()
    .default("preparer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  name: text("name").notNull(),
  contractNumber: text("contract_number"),
  // flat = single fee for the term; tranched = ramped user adds; tiered = stepped pricing tiers
  billingModel: text("billing_model", {
    enum: ["flat", "tranched", "tiered"],
  })
    .notNull()
    .default("flat"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  tcv: numeric("tcv", { precision: 14, scale: 2 }).notNull().default("0"),
  licensePct: numeric("license_pct", { precision: 6, scale: 4 })
    .notNull()
    .default("0.2"),
  billingFrequency: text("billing_frequency", {
    enum: ["monthly", "quarterly", "annual", "upfront", "custom"],
  })
    .notNull()
    .default("annual"),
  // day count convention for the ratable support component
  dayCount: text("day_count", { enum: ["inclusive", "exclusive"] })
    .notNull()
    .default("inclusive"),
  status: text("status", {
    enum: ["active", "complete", "cancelled"],
  })
    .notNull()
    .default("active"),
  campfireId: text("campfire_id"), // Campfire contract id for sync matching
  crmLink: text("crm_link"), // Salesforce opportunity URL (from Campfire)
  reviewStatus: text("review_status", {
    enum: ["draft", "in_review", "approved"],
  })
    .notNull()
    .default("draft"),
  preparedById: uuid("prepared_by_id").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  approvedById: uuid("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Performance segments. Flat contracts get one implicit segment (the contract
// itself) unless rows exist here. Tranched/tiered contracts list each tranche
// or tier: license (licensePct x amount) is recognized point-in-time in the
// segment's start month; support is recognized daily over segment start->end.
export const tranches = pgTable("tranches", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  seats: integer("seats"),
  pricePerSeat: numeric("price_per_seat", { precision: 12, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // pre-tax
  taxRate: numeric("tax_rate", { precision: 7, scale: 5 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status", {
    enum: ["draft", "issued", "paid", "void"],
  })
    .notNull()
    .default("draft"),
  reviewStatus: text("review_status", {
    enum: ["draft", "in_review", "approved"],
  })
    .notNull()
    .default("draft"),
  preparedById: uuid("prepared_by_id").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  approvedById: uuid("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  description: text("description"),
  externalRef: text("external_ref"), // NetSuite / Campfire / SFDC reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const labels = pgTable("labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
});

export const contractLabels = pgTable(
  "contract_labels",
  {
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contractId, t.labelId] })]
);

export const invoiceLabels = pgTable(
  "invoice_labels",
  {
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.invoiceId, t.labelId] })]
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(), // contract | invoice | tranche | user | label | settings
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // created | updated | deleted | submitted | approved | reopened | signed_off
  userId: uuid("user_id").references(() => users.id),
  userName: text("user_name"),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Tranche = typeof tranches.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Label = typeof labels.$inferSelect;
