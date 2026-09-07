'use client';

import { isPageShortcutBlocked } from '@tuturuuu/utils/keyboard-shortcuts';
import { useEffect, useEffectEvent } from 'react';
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
  actions: Record<CalendarView, () => void> & {
    enabled: boolean;
    availableViews?: { value: string; disabled?: boolean }[];
  }
) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const view = calendarShortcutView(event);
    if (!view) return;
    const available = actions.availableViews;
    if (
      available?.length &&
      !available.some((item) => item.value === view && !item.disabled)
    )
      return;
    event.preventDefault();
    actions[view]();
  });
  useEffect(() => {
    if (!actions.enabled) return;
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [actions.enabled]);
}
