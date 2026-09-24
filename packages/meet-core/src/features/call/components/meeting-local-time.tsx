'use client';

import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const browserSnapshot = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverSnapshot = () => undefined;

/** Browser timezone, not the server's UTC default; no misleading SSR time. */
export function useMeetingTimeZone() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}

export function MeetingLocalTime({
  value,
  pattern = 'PPP p z',
}: {
  value: string;
  pattern?: string;
}) {
  const locale = useLocale();
  const timeZone = useMeetingTimeZone();
  const date = new Date(value);
  return (
    <time dateTime={value}>
      {timeZone && Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(locale, {
            ...(pattern.includes('P')
              ? {
                  year: 'numeric' as const,
                  month: 'long' as const,
                  day: 'numeric' as const,
                }
              : {}),
            ...(pattern.includes('p')
              ? { hour: 'numeric' as const, minute: '2-digit' as const }
              : {}),
            ...(pattern.includes('z')
              ? { timeZoneName: 'short' as const }
              : {}),
            timeZone,
          }).format(date)
        : '\u2014'}
    </time>
  );
}
