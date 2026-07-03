import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getInventoryAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'inventory',
    candidates: [
      process.env.INVENTORY_APP_URL,
      process.env.NEXT_PUBLIC_INVENTORY_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://inventory.tuturuuu.com'
        : getLocalInternalAppUrl('inventory', 'http://localhost:7815'),
  });
}
