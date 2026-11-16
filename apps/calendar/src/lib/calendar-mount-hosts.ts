import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';

/**
 * Hosts that serve Calendar under its base path in the production artifact.
 * `start-bridge.config.ts` (native Worker) and the Next proxy both read this
 * list, so the apex mount host has a single definition.
 */
export const CALENDAR_PRODUCTION_MOUNT_HOSTS = ['tuturuuu.com'] as const;

/**
 * True only when `url` is a configured apex mount host serving `basePath`.
 * Hosts compare exactly as the native resolver does: case-insensitive, port
 * included, no trailing-dot or suffix match. Pass the URL the runtime routed
 * the request to, never a value derived from forwarding headers.
 */
export function isCalendarApexMountUrl(url: URL, basePath: string) {
  if (!basePath) return false;
  return (
    resolveAppBase(url, {
      app: 'calendar',
      rootHosts: [],
      mountHosts: CALENDAR_PRODUCTION_MOUNT_HOSTS,
      basePath,
      unknownHost: 'reject',
    })?.mode === 'mounted'
  );
}
