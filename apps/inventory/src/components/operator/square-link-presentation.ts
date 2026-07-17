import type { InventorySquareCatalogLink } from '@tuturuuu/internal-api/inventory';

export type SquareLinkPresentationKind =
  | 'conflict'
  | 'linked'
  | 'price_retry'
  | 'remote_deleted'
  | 'sync_error';

const NON_WHOLE_PRICE_ERROR =
  /^Square reported a non-whole ([A-Z]{3}) price \(([^)]+)\)\./;

export function getSquareLinkPresentation(
  link: Pick<InventorySquareCatalogLink, 'lastError' | 'status'>
): {
  currency: string | null;
  kind: SquareLinkPresentationKind;
  squarePrice: string | null;
} {
  const fractionalPrice = link.lastError?.match(NON_WHOLE_PRICE_ERROR);

  if (link.status === 'error' && fractionalPrice) {
    return {
      currency: fractionalPrice[1] ?? null,
      kind: 'price_retry',
      squarePrice: fractionalPrice[2] ?? null,
    };
  }

  if (link.status === 'active') {
    return { currency: null, kind: 'linked', squarePrice: null };
  }

  if (link.status === 'error') {
    return { currency: null, kind: 'sync_error', squarePrice: null };
  }

  return { currency: null, kind: link.status, squarePrice: null };
}
