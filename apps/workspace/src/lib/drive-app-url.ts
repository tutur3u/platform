import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getDriveAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'drive',
    candidates: [
      process.env.DRIVE_APP_URL,
      process.env.NEXT_PUBLIC_DRIVE_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://drive.tuturuuu.com'
        : getLocalInternalAppUrl('drive', 'http://localhost:7817'),
  });
}
