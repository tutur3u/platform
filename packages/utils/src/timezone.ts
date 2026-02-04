/**
 * Timezone utilities for handling timezone validation and resolution.
 *
 * This module provides helpers for:
 * - Validating IANA timezone identifiers
 * - Detecting browser timezone
 * - Resolving "auto" timezone settings to actual values
 */

/**
 * Cache of valid timezone identifiers for performance.
 * Lazily initialized on first use.
 */
let cachedTimezones: Set<string> | null = null;

/**
 * Gets the set of valid IANA timezone identifiers.
 * Uses Intl.supportedValuesOf when available, falls back to a basic check.
 */
function getValidTimezones(): Set<string> {
  if (cachedTimezones) return cachedTimezones;

  try {
    // Modern browsers and Node.js 18+ support this
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      const timezones = (
        Intl as unknown as {
          supportedValuesOf: (key: string) => string[];
        }
      ).supportedValuesOf('timeZone');
      cachedTimezones = new Set(timezones);
      return cachedTimezones;
    }
  } catch {
    // Fall through to basic validation
  }

  // Fallback: empty set means we'll use try/catch validation
  cachedTimezones = new Set();
  return cachedTimezones;
}

/**
 * Validates if a string is a valid IANA timezone identifier.
 *
 * @param tz - The timezone string to validate (e.g., 'America/New_York', 'Asia/Ho_Chi_Minh')
 * @returns true if the timezone is valid, false otherwise
 *
 * @example
 * isValidTimezone('America/New_York') // true
 * isValidTimezone('Asia/Ho_Chi_Minh') // true
 * isValidTimezone('UTC') // true
 * isValidTimezone('Invalid/Timezone') // false
 * isValidTimezone('PST') // false (abbreviations are not valid IANA identifiers)
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;

  const validTimezones = getValidTimezones();

  // If we have a cached set and it includes the timezone, return true
  if (validTimezones.size > 0 && validTimezones.has(tz)) {
    return true;
  }

  // Always try the DateTimeFormat fallback as the authoritative check
  // This handles cases like 'UTC' which may not be in supportedValuesOf
  // but is still valid for DateTimeFormat
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the browser's detected timezone.
 *
 * @returns The IANA timezone identifier (e.g., 'America/New_York')
 *          or 'UTC' if detection fails or running on server
 *
 * @example
 * // In browser with system timezone set to Ho Chi Minh
 * getBrowserTimezone() // 'Asia/Ho_Chi_Minh'
 *
 * // On server or when detection fails
 * getBrowserTimezone() // 'UTC'
 */
export function getBrowserTimezone(): string {
  try {
    if (
      typeof Intl !== 'undefined' &&
      typeof Intl.DateTimeFormat === 'function'
    ) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone && isValidTimezone(timezone)) {
        return timezone;
      }
    }
  } catch {
    // Fallback to UTC
  }
  return 'UTC';
}

/**
 * Special value indicating automatic timezone detection.
 */
export const AUTO_TIMEZONE = 'auto' as const;

/**
 * Resolves a timezone setting to an actual IANA timezone identifier.
 *
 * This handles the "auto" case by detecting the browser timezone on the client,
 * and validates explicit timezone values. Invalid or missing values fall back to UTC.
 *
 * @param timezone - The timezone setting, which can be:
 *   - 'auto' - Resolve to browser timezone
 *   - A valid IANA identifier - Return as-is
 *   - null/undefined/invalid - Fall back to UTC
 *
 * @returns A valid IANA timezone identifier
 *
 * @example
 * // On client with browser timezone 'Asia/Ho_Chi_Minh'
 * resolveAutoTimezone('auto') // 'Asia/Ho_Chi_Minh'
 *
 * // Explicit valid timezone
 * resolveAutoTimezone('America/New_York') // 'America/New_York'
 *
 * // Invalid or missing
 * resolveAutoTimezone(null) // 'UTC'
 * resolveAutoTimezone('Invalid') // 'UTC'
 */
export function resolveAutoTimezone(timezone?: string | null): string {
  // Handle auto detection
  if (timezone === AUTO_TIMEZONE || timezone === 'auto') {
    return getBrowserTimezone();
  }

  // Validate explicit timezone
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }

  // Fallback to UTC
  return 'UTC';
}

/**
 * Gets a timezone offset string for a given IANA timezone at a specific date.
 *
 * @param timezone - The IANA timezone identifier
 * @param date - The date to get the offset for (defaults to now)
 * @returns The offset string in format '+HH:MM' or '-HH:MM'
 *
 * @example
 * getTimezoneOffset('America/New_York') // '-05:00' or '-04:00' depending on DST
 * getTimezoneOffset('Asia/Ho_Chi_Minh') // '+07:00'
 */
export function getTimezoneOffset(
  timezone: string,
  date: Date = new Date()
): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });

    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');

    if (offsetPart?.value) {
      // Extract offset from format like "GMT+07:00" or "GMT-05:00"
      const match = offsetPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match?.[1]) {
        return match[1];
      }
      // Handle "GMT" (UTC) case
      if (offsetPart.value === 'GMT') {
        return '+00:00';
      }
    }
  } catch {
    // Fallback
  }
  return '+00:00';
}
