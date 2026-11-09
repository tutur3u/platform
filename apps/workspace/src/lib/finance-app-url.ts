import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getFinanceAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'finance',
    candidates: [
      process.env.FINANCE_APP_URL,
      process.env.NEXT_PUBLIC_FINANCE_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://finance.tuturuuu.com'
        : getLocalInternalAppUrl('finance', 'http://localhost:7808'),
  });
}
