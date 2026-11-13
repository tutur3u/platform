import { readChangelog } from './embed.ts';

/** Patch notes embedded by this build, or null (section hidden). */
export const BUILD_CHANGELOG = readChangelog(
  typeof __ROADMAP_CHANGELOG__ === 'undefined' ? null : __ROADMAP_CHANGELOG__
);
