// Deep links into external systems.
// If Campfire's app routes differ for your account, correct the two
// templates below (open a contract/invoice in Campfire and copy the URL
// shape) - one-line change.

const CAMPFIRE_APP = "https://app.meetcampfire.com";

export function campfireContractUrl(campfireId: string | null | undefined): string | null {
  if (!campfireId) return null;
  return `${CAMPFIRE_APP}/revenue/contracts/${campfireId}`;
}

/** externalRef holds the Campfire invoice id for synced/loaded invoices. */
export function campfireInvoiceUrl(externalRef: string | null | undefined): string | null {
  if (!externalRef || !/^\d+$/.test(externalRef)) return null;
  return `${CAMPFIRE_APP}/invoicing/invoices/${externalRef}`;
}
