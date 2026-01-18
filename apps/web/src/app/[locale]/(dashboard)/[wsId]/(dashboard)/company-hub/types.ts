// Founding date: June 20, 2022 at 00:00:00 GMT+7

import { Lightbulb, Rocket, TrendingUp, Trophy } from '@tuturuuu/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Configure dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

export const FOUNDING_DATE = dayjs.tz(
  '2022-06-20 00:00:00',
  'Asia/Ho_Chi_Minh'
);

export const QUARTERS = [
  {
    id: 'q1',
    months: [2, 3, 4],
    startMonth: 2,
    icon: Lightbulb,
    color: 'cyan',
  },
  { id: 'q2', months: [5, 6, 7], startMonth: 5, icon: Rocket, color: 'green' },
  {
    id: 'q3',
    months: [8, 9, 10],
    startMonth: 8,
    icon: TrendingUp,
    color: 'orange',
  },
  {
    id: 'q4',
    months: [11, 12, 1],
    startMonth: 11,
    icon: Trophy,
    color: 'purple',
  },
] as const;

export type QuarterId = (typeof QUARTERS)[number]['id'];

export interface YearInfo {
  fiscalYear: number;
  currentQuarter: QuarterId | 'january';
  quarterIndex: number;
  progressPercent: number;
  daysRemaining: number;
  daysPassed: number;
  weekInQuarter: number;
  totalWeeksInQuarter: number;
  isJanuary: boolean;
  isBirthday: boolean;
  daysUntilBirthday: number;
  isYearEndPartyMonth: boolean;
  isYearEndPartyPassed: boolean;
  daysUntilYearEndParty: number;
  companyAge: { years: number; months: number; days: number };
  currentMonth: number;
  currentDay: number;
}

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export { dayjs };
