import { type ActivitySnapshot, parseActivity } from './activity.ts';

/**
 * This build's activity observation, embedded by Vite from
 * .generated/activity.json (scripts/generate-roadmap-data.mjs). Outside a
 * build it is "missing", which the page shows as not available.
 */
export const BUILD_ACTIVITY: ActivitySnapshot = parseActivity(
  typeof __ROADMAP_ACTIVITY__ === 'undefined' ? null : __ROADMAP_ACTIVITY__
);
