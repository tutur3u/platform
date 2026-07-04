import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getToolsAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'tools',
    candidates: [
      process.env.TOOLS_APP_URL,
      process.env.NEXT_PUBLIC_TOOLS_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://tools.tuturuuu.com'
        : getLocalInternalAppUrl('tools', 'http://localhost:7825'),
  });
}
