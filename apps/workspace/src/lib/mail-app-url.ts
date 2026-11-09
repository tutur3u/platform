import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getMailAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'mail',
    candidates: [
      process.env.MAIL_APP_URL,
      process.env.NEXT_PUBLIC_MAIL_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://mail.tuturuuu.com'
        : getLocalInternalAppUrl('mail', 'http://localhost:7820'),
  });
}
