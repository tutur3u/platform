import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const PORT = process.env.PORT || 7827;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_CONTACTS_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://contacts.tuturuuu.com'
    : getLocalInternalAppUrl('contacts', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

const DEFAULT_INVENTORY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://inventory.tuturuuu.com'
    : getLocalInternalAppUrl('inventory', 'http://localhost:7815');

export const BASE_URL = resolveInternalAppUrl({
  appName: 'contacts',
  candidates: [
    process.env.CONTACTS_APP_URL,
    process.env.NEXT_PUBLIC_CONTACTS_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_CONTACTS_APP_URL,
});

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});

export const INVENTORY_APP_URL = resolveInternalAppUrl({
  appName: 'inventory',
  candidates: [
    process.env.INVENTORY_APP_URL,
    process.env.NEXT_PUBLIC_INVENTORY_APP_URL,
  ],
  fallback: DEFAULT_INVENTORY_APP_URL,
});

export const TTR_URL = WEB_APP_URL;
