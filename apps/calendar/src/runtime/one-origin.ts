import {
  type OneOriginMode,
  parseOneOriginMode,
} from '@tuturuuu/utils/one-origin-routing';

/**
 * Same staged switch as Mail (`TTR_ONE_ORIGIN_<APP>`).
 *
 * `off` serves the registered subdomain and refuses the apex mount.
 * `shadow` serves both; this sealed release uses shadow.
 * `on` is the deferred cutover: the legacy subdomain redirect and
 * service-worker cleanup run, and the apex mount stays canonical.
 * Anything else fails closed to `off`.
 */
export const CALENDAR_ONE_ORIGIN_VAR = 'TTR_ONE_ORIGIN_CALENDAR';

export function calendarOneOriginMode(env: object | undefined): OneOriginMode {
  const value = (env as Record<string, unknown> | undefined)?.[
    CALENDAR_ONE_ORIGIN_VAR
  ];
  return parseOneOriginMode(typeof value === 'string' ? value : undefined);
}
