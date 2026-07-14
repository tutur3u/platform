import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  PUBLIC_PATHS,
  SHOW_TAILWIND_INDICATOR,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const PORT = process.env.PORT || 7815;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_INVENTORY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://inventory.tuturuuu.com'
    : getLocalInternalAppUrl('inventory', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const INVENTORY_APP_URL = resolveInternalAppUrl({
  appName: 'inventory',
  candidates: [
    process.env.INVENTORY_APP_URL,
    process.env.NEXT_PUBLIC_INVENTORY_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_INVENTORY_APP_URL,
});

export const STOREFRONT_APP_URL = resolveInternalAppUrl({
  appName: 'storefront',
  candidates: [
    process.env.STOREFRONT_APP_URL,
    process.env.NEXT_PUBLIC_STOREFRONT_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://storefront.tuturuuu.com'
      : getLocalInternalAppUrl('storefront', 'http://localhost:7822'),
});

export const CONTACTS_APP_URL = resolveInternalAppUrl({
  appName: 'contacts',
  candidates: [
    process.env.CONTACTS_APP_URL,
    process.env.NEXT_PUBLIC_CONTACTS_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://contacts.tuturuuu.com'
      : getLocalInternalAppUrl('contacts', 'http://localhost:7827'),
});

export const BASE_URL = INVENTORY_APP_URL;
export const API_URL = process.env.API_URL || `${BASE_URL}/api`;

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});

export const TTR_URL = WEB_APP_URL;
