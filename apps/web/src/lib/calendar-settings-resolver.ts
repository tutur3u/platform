/**
 * Calendar Settings Resolver
 *
 * Implements priority system for calendar preferences:
 * User settings > Workspace settings > Auto-detection
 */

type FirstDayOfWeek = 'auto' | 'sunday' | 'monday' | 'saturday';

interface CalendarSettings {
  timezone: string;
  firstDayOfWeek: FirstDayOfWeek;
  timeFormat: '12h' | '24h';
}

export interface User {
  timezone?: string | null;
  first_day_of_week?: string | null;
  time_format?: string | null;
}

export interface Workspace {
  timezone?: string | null;
  first_day_of_week?: string | null;
}

/**
 * Detects the system timezone using Intl API
 */
export function detectSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback to UTC if detection fails
    return 'UTC';
  }
}

/**
 * Detects the first day of week based on locale
 * Vietnamese: Monday
 * US/Canada: Sunday
 * Middle East: Saturday
 */
export function detectLocaleFirstDay(locale?: string): FirstDayOfWeek {
  const userLocale =
    locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  // Vietnamese locale uses Monday as first day
  if (userLocale.startsWith('vi')) {
    return 'monday';
  }

  // US, Canada, and some other countries use Sunday
  if (userLocale.startsWith('en-US') || userLocale.startsWith('en-CA')) {
    return 'sunday';
  }

  // Middle Eastern countries typically use Saturday
  if (userLocale.startsWith('ar') || userLocale.startsWith('he')) {
    return 'saturday';
  }

  // Most European and other countries use Monday
  return 'monday';
}

/**
 * Detects the preferred time format based on locale
 * Uses Intl.DateTimeFormat to determine if the locale uses 12h or 24h format
 */
export function detectLocaleTimeFormat(locale?: string): '12h' | '24h' {
  const userLocale =
    locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  try {
    // Use Intl.DateTimeFormat to detect the locale's preferred format
    const formatter = new Intl.DateTimeFormat(userLocale, { hour: 'numeric' });
    const parts = formatter.formatToParts(new Date(2000, 0, 1, 13, 0));
    const hourPart = parts.find((p) => p.type === 'hour');

    // If hour is "1" instead of "13", it's 12-hour format
    return hourPart?.value === '1' ? '12h' : '24h';
  } catch {
    // Fallback to 12h for English locales, 24h for others
    return userLocale.startsWith('en') ? '12h' : '24h';
  }
}

/**
 * Resolves the effective time format based on user setting
 */
export function resolveTimeFormat(
  user?: Pick<User, 'time_format'> | null,
  locale?: string
): '12h' | '24h' {
  // User setting takes priority
  if (user?.time_format && user.time_format !== 'auto') {
    return user.time_format as '12h' | '24h';
  }

  // Auto-detection based on locale
  return detectLocaleTimeFormat(locale);
}

/**
 * Resolves the effective timezone based on priority system
 */
export function resolveTimezone(
  user?: Pick<User, 'timezone'> | null,
  workspace?: Pick<Workspace, 'timezone'> | null
): string {
  // Priority 1: User setting
  if (user?.timezone && user.timezone !== 'auto') {
    return user.timezone;
  }

  // Priority 2: Workspace setting
  if (workspace?.timezone && workspace.timezone !== 'auto') {
    return workspace.timezone;
  }

  // Priority 3: Auto-detection
  return detectSystemTimezone();
}

/**
 * Resolves the effective first day of week based on priority system
 */
export function resolveFirstDayOfWeek(
  user?: Pick<User, 'first_day_of_week'> | null,
  workspace?: Pick<Workspace, 'first_day_of_week'> | null,
  locale?: string
): FirstDayOfWeek {
  // Priority 1: User setting
  if (user?.first_day_of_week && user.first_day_of_week !== 'auto') {
    return user.first_day_of_week as FirstDayOfWeek;
  }

  // Priority 2: Workspace setting
  if (workspace?.first_day_of_week && workspace.first_day_of_week !== 'auto') {
    return workspace.first_day_of_week as FirstDayOfWeek;
  }

  // Priority 3: Auto-detection based on locale
  return detectLocaleFirstDay(locale);
}

/**
 * Resolves all calendar settings at once
 */
export function resolveCalendarSettings(
  user?: User | null,
  workspace?: Workspace | null,
  locale?: string
): CalendarSettings {
  return {
    timezone: resolveTimezone(user, workspace),
    firstDayOfWeek: resolveFirstDayOfWeek(user, workspace, locale),
    timeFormat: resolveTimeFormat(user, locale),
  };
}

/**
 * Converts first day of week string to number (for Date compatibility)
 * 0 = Sunday, 1 = Monday, 6 = Saturday
 */
export function firstDayToNumber(day: FirstDayOfWeek, locale?: string): number {
  if (day === 'auto') {
    day = detectLocaleFirstDay(locale);
  }

  switch (day) {
    case 'sunday':
      return 0;
    case 'monday':
      return 1;
    case 'saturday':
      return 6;
    default:
      return 1; // Default to Monday
  }
}

/**
 * Converts number to first day of week string
 * 0 = Sunday, 1 = Monday, 6 = Saturday
 */
export function numberToFirstDay(num: number): FirstDayOfWeek {
  switch (num) {
    case 0:
      return 'sunday';
    case 1:
      return 'monday';
    case 6:
      return 'saturday';
    default:
      return 'monday'; // Default to Monday
  }
}
