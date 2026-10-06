'use client';
import { toast } from '@tuturuuu/ui/sonner';
import { meetingAiRequestFailure } from './request-failure';

type FailureKey = NonNullable<
  ReturnType<typeof meetingAiRequestFailure>['key']
>;
/** Never pass an exception message, response body, identity or URL to the toast/log. */
export function showMeetingAiFailure(
  t: (key: 'failed' | FailureKey) => string,
  error: unknown
) {
  const { key, status, code } = meetingAiRequestFailure(error);
  console.warn('Meeting AI request failed', { status, code });
  toast.error(t('failed'), { description: key ? t(key) : undefined });
}
