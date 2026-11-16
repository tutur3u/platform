'use client';

import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` so relative labels stay true. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatClockTime(locale: string, iso: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
