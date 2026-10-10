import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

/** Always targets Meet, even when the shared runtime's BASE_URL targets Parley. */
export function meetReviewUrl(wsId: string, meetingId: string) {
  const origin = resolveInternalAppUrl({
    appName: 'meet',
    candidates: [
      process.env.MEET_APP_URL,
      process.env.NEXT_PUBLIC_MEET_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://meet.tuturuuu.com'
        : getLocalInternalAppUrl('meet', 'http://localhost:7807'),
  });
  return `${origin}/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}`;
}
