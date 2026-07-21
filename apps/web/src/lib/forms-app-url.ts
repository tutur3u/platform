import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

/**
 * forms.tuturuuu.com owns the entire forms product.
 *
 * Unlike the contacts/pay rollouts, this is NOT a dual-run: apps/web no longer
 * contains any forms pages, feature code, or API routes. Web only redirects.
 * That means the forms Vercel project must be live BEFORE this ships.
 */
export function getFormsAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'forms',
    candidates: [
      process.env.FORMS_APP_URL,
      process.env.NEXT_PUBLIC_FORMS_APP_URL,
      process.env.TUTURUUU_FORMS_BASE_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://forms.tuturuuu.com'
        : getLocalInternalAppUrl('forms', 'http://localhost:7828'),
  });
}

/**
 * Absolute URL for a workspace's forms surface on forms.tuturuuu.com. Callers
 * pass an unlocalized `/{wsId}` path; the forms proxy handles locale.
 */
export function getFormsWorkspaceUrl(wsId: string) {
  return `${getFormsAppOrigin()}/${encodeURIComponent(wsId)}/forms`;
}

/**
 * Public shared-form permalink on forms.tuturuuu.com.
 *
 * Legacy links point at `tuturuuu.com/<locale>/shared/forms/<shareCode>`; web
 * permanently redirects those here so already-distributed links and cached
 * social cards keep resolving.
 */
export function getSharedFormUrl(shareCode: string) {
  return `${getFormsAppOrigin()}/f/${encodeURIComponent(shareCode)}`;
}
