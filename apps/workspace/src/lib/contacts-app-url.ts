import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

/**
 * Dual-run rollout gate for the contacts.tuturuuu.com migration.
 *
 * Default OFF: apps/web still owns and renders the users/ CRM section, so
 * merging contacts work never changes web behavior. Flip to `true` only after
 * the contacts Vercel deployment is confirmed healthy — then web defers the
 * users surface to contacts.
 *
 * Kept as a plain function (not a React hook) so it is safe to call from
 * server components, route handlers, and client code alike.
 */
export function isContactsRolloutEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_CONTACTS_APP === 'true';
}

export function getContactsAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'contacts',
    candidates: [
      process.env.CONTACTS_APP_URL,
      process.env.NEXT_PUBLIC_CONTACTS_APP_URL,
      process.env.TUTURUUU_CONTACTS_BASE_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://contacts.tuturuuu.com'
        : getLocalInternalAppUrl('contacts', 'http://localhost:7827'),
  });
}

/**
 * Absolute URL for a workspace's CRM/user-management surface on
 * contacts.tuturuuu.com. The contacts proxy re-adds the locale segment, so
 * callers pass an unlocalized `/{wsId}` path.
 */
export function getContactsWorkspaceUrl(wsId: string) {
  return `${getContactsAppOrigin()}/${encodeURIComponent(wsId)}`;
}
