/**
 * Origins and base path Calendar is served from. This module has no imports so
 * build configuration and runtime code share one definition; every other
 * module builds URLs from these values instead of spelling a host.
 */

/** Calendar at the root of its own host. */
export const CALENDAR_ROOT_ORIGIN = 'https://calendar.tuturuuu.com';

/** The central web origin, which also hosts Calendar under the mount path. */
export const WEB_ORIGIN = 'https://tuturuuu.com';

/** Path Calendar is mounted under on the web origin. */
export const CALENDAR_MOUNT_BASE_PATH = '/calendar';
