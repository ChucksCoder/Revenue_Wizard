// Deep links into external systems.
// URL patterns verified against the live Campfire app (v2 routes):
//   contract: app.meetcampfire.com/v2/revenue/contracts/{id}
//   invoice:  app.meetcampfire.com/v2/accounting/invoices/{id}

const CAMPFIRE_APP = "https://app.meetcampfire.com";

export function campfireContractUrl(campfireId: string | null | undefined): string | null {
  if (!campfireId) return null;
  return `${CAMPFIRE_APP}/v2/revenue/contracts/${campfireId}`;
}

/** externalRef holds the Campfire invoice id for synced/loaded invoices. */
export function campfireInvoiceUrl(externalRef: string | null | undefined): string | null {
  if (!externalRef || !/^\d+$/.test(externalRef)) return null;
  return `${CAMPFIRE_APP}/v2/accounting/invoices/${externalRef}`;
}
