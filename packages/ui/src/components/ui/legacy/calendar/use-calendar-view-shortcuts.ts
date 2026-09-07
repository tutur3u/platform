'use client';

import { isPageShortcutBlocked } from '@tuturuuu/utils/keyboard-shortcuts';
import { useEffect } from 'react';
import type { CalendarView } from '../../../../hooks/use-view-transition';

export const CALENDAR_VIEW_KEYS: Record<string, CalendarView> = {
  d: 'day',
  '4': '4-days',
  w: 'week',
  m: 'month',
  y: 'year',
  a: 'agenda',
};

export function calendarShortcutView(
  event: KeyboardEvent
): CalendarView | null {
  if (
    isPageShortcutBlocked(event) ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  )
    return null;
  return CALENDAR_VIEW_KEYS[event.key.toLowerCase()] ?? null;
}

export function useCalendarViewShortcuts(
  actions: Record<CalendarView, () => void> & { enabled: boolean }
) {
  useEffect(() => {
    if (!actions.enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const view = calendarShortcutView(event);
      if (!view) return;
      event.preventDefault();
      actions[view]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);
}
