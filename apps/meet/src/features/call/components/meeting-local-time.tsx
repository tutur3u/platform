'use client';

import { format } from 'date-fns';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/** Render in the viewer's timezone, consistently with the meeting list. */
export function MeetingLocalTime({
  value,
  pattern,
}: {
  value: string;
  pattern: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    browserSnapshot,
    serverSnapshot
  );
  return (
    <time dateTime={value}>
      {hydrated ? format(new Date(value), pattern) : value}
    </time>
  );
}
