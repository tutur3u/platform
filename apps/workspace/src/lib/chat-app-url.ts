import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getChatAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'chat',
    candidates: [
      process.env.CHAT_APP_URL,
      process.env.NEXT_PUBLIC_CHAT_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://chat.tuturuuu.com'
        : getLocalInternalAppUrl('chat', 'http://localhost:7821'),
  });
}
