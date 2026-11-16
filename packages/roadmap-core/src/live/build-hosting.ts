import { type HostingSnapshot, parseHostingSnapshot } from './hosting.ts';

/**
 * This build's hosting observation, embedded by Vite from
 * .generated/hosting.json (scripts/generate-roadmap-data.mjs). Outside a
 * build it is "missing", which the page shows as not verifiable.
 */
export const BUILD_HOSTING: HostingSnapshot = parseHostingSnapshot(
  typeof __ROADMAP_HOSTING__ === 'undefined' ? null : __ROADMAP_HOSTING__
);
