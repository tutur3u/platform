'use client';

import { useTranslations } from 'next-intl';

export type EventColor = 'blue' | 'green' | 'purple' | 'orange' | 'cyan';

export interface DemoEvent {
  id: string;
  title: string;
  /** 0-4, Monday through Friday. */
  startDay: number;
  endDay: number;
  /** Fractional hours, e.g. 9.75 for 09:45. */
  startHour?: number;
  endHour?: number;
  color: EventColor;
  isMultiDay?: boolean;
  /** Rendered with an assistant marker: the block was placed automatically. */
  autoScheduled?: boolean;
}

/** Visible hour band for the compact week grid. */
export const GRID_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

/** Row height in pixels for one hour of the grid. */
export const HOUR_HEIGHT = 38;

export function useCalendarEvents(): DemoEvent[] {
  const t = useTranslations('landing.demo.calendarGrid.events');

  return [
    {
      id: 'offsite',
      title: t('teamOffsite'),
      startDay: 2,
      endDay: 3,
      color: 'green',
      isMultiDay: true,
    },
    {
      id: 'mon-standup',
      title: t('standup'),
      startDay: 0,
      endDay: 0,
      startHour: 9,
      endHour: 9.75,
      color: 'blue',
    },
    {
      id: 'mon-focus',
      title: t('focusTime'),
      startDay: 0,
      endDay: 0,
      startHour: 10,
      endHour: 12,
      color: 'purple',
      autoScheduled: true,
    },
    {
      id: 'mon-sync',
      title: t('teamSync'),
      startDay: 0,
      endDay: 0,
      startHour: 14,
      endHour: 15,
      color: 'cyan',
    },
    {
      id: 'tue-planning',
      title: t('planning'),
      startDay: 1,
      endDay: 1,
      startHour: 10,
      endHour: 11.5,
      color: 'blue',
    },
    {
      id: 'tue-client',
      title: t('clientCall'),
      startDay: 1,
      endDay: 1,
      startHour: 14,
      endHour: 15,
      color: 'orange',
    },
    {
      id: 'wed-standup',
      title: t('standup'),
      startDay: 2,
      endDay: 2,
      startHour: 9,
      endHour: 9.5,
      color: 'blue',
    },
    {
      id: 'thu-review',
      title: t('review'),
      startDay: 3,
      endDay: 3,
      startHour: 15,
      endHour: 16,
      color: 'cyan',
    },
    {
      id: 'fri-standup',
      title: t('standup'),
      startDay: 4,
      endDay: 4,
      startHour: 9,
      endHour: 9.5,
      color: 'blue',
    },
    {
      id: 'fri-one-on-one',
      title: t('oneOnOne'),
      startDay: 4,
      endDay: 4,
      startHour: 11,
      endHour: 12,
      color: 'green',
    },
    {
      id: 'fri-weekly',
      title: t('weeklyReview'),
      startDay: 4,
      endDay: 4,
      startHour: 14,
      endHour: 15.5,
      color: 'purple',
      autoScheduled: true,
    },
  ];
}
