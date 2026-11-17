import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

const contactsOrigin = resolveInternalAppUrl({
  appName: 'contacts',
  candidates: [process.env.NEXT_PUBLIC_CONTACTS_APP_URL],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://contacts.tuturuuu.com'
      : getLocalInternalAppUrl('contacts', 'http://localhost:7827'),
});

/** Contacts database URL for a workspace, or one contact inside it. */
export function contactsHref(
  locale: string,
  workspaceId: string,
  contactId?: string
) {
  const base = `${contactsOrigin}/${encodeURIComponent(locale)}/${encodeURIComponent(workspaceId)}/users/database`;
  return contactId ? `${base}/${encodeURIComponent(contactId)}` : base;
}
