import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';

type SaleTitleLabels = {
  inventory: string;
  online: string;
  square: string;
  storefront: string;
};

const OPAQUE_REFERENCE = /^(?:[a-f\d]{24,}|[a-f\d-]{32,})$/i;

function cleanLabel(value: string | null | undefined) {
  const label = value?.trim();
  return label && !OPAQUE_REFERENCE.test(label) ? label : null;
}

export function getInventorySaleDisplayTitle(
  sale: InventorySaleSummary,
  labels: SaleTitleLabels
) {
  if (sale.source === 'finance_invoice') {
    return (
      cleanLabel(sale.notice) ??
      cleanLabel(sale.customer_name) ??
      labels.inventory
    );
  }

  if (sale.square_order_id) return labels.square;
  if (sale.polar_order_id) return labels.online;
  return labels.storefront;
}

export function getInventorySaleShortReference(sale: InventorySaleSummary) {
  const reference = sale.public_token?.trim() || sale.id;
  return reference.slice(0, 8).toUpperCase();
}
