'use client';

import { isPageShortcutBlocked } from '@tuturuuu/utils/keyboard-shortcuts';
import { useEffect, useEffectEvent } from 'react';

export type CalendarPeriodAction = 'previous' | 'next' | 'today';

/** Period navigation keys shown in the header tooltips. */
export const CALENDAR_PERIOD_KEYS: Record<CalendarPeriodAction, string> = {
  previous: 'K',
  next: 'J',
  today: 'T',
};

const keyActions: Record<string, CalendarPeriodAction> = {
  k: 'previous',
  p: 'previous',
  j: 'next',
  n: 'next',
  t: 'today',
};

export function calendarShortcutPeriod(
  event: KeyboardEvent
): CalendarPeriodAction | null {
  if (
    isPageShortcutBlocked(event) ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  )
    return null;
  return keyActions[event.key.toLowerCase()] ?? null;
}

/** Keyboard period navigation for the calendar header. */
export function useCalendarPeriodShortcuts(
  actions: Record<CalendarPeriodAction, () => void>
) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = calendarShortcutPeriod(event);
    if (!action) return;
    event.preventDefault();
    actions[action]();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
