import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getPasswordsAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'passwords',
    candidates: [process.env.PASSWORDS_APP_URL],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://passwords.tuturuuu.com'
        : getLocalInternalAppUrl('passwords', 'http://localhost:7829'),
  });
}
