import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectTechStack } from './collect-tech-stack.ts';
import { activityForBuild } from './insights/activity.ts';
import { parseBugFeed } from './live/edufest-bugs.ts';
import { parseEvidence } from './live/evidence.ts';
import { snapshotForBuild } from './live/hosting.ts';

// Written by apps/roadmap/scripts/generate-roadmap-data.mjs; never committed.
const HOSTING_FILE = new URL('../.generated/hosting.json', import.meta.url);
const ACTIVITY_FILE = new URL('../.generated/activity.json', import.meta.url);
const EVIDENCE_FILE = new URL('../.generated/evidence.json', import.meta.url);
const BUGS_FILE = new URL('../.generated/edufest-bugs.json', import.meta.url);

/** A generated JSON file, or null when it is absent or unreadable. */
function generated(file: URL): unknown {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

/**
 * The roadmap's build-time values (src/env.d.ts) as a Vite `define`, for
 * every app that renders the roadmap: apps/roadmap's own Worker and the
 * marketing app's roadmap routes. A build needs its immutable source commit.
 */
export function roadmapBuildDefines(
  command: 'build' | 'serve',
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const source = env.ROADMAP_SOURCE_SHA ?? env.GITHUB_SHA;
  if (command === 'build' && !/^[a-f0-9]{40}$/.test(source ?? '')) {
    throw new Error(
      'A roadmap build requires its immutable ROADMAP_SOURCE_SHA'
    );
  }
  return {
    __ROADMAP_TECH_STACK__: JSON.stringify(
      collectTechStack(fileURLToPath(new URL('../../..', import.meta.url)))
    ),
    __ROADMAP_BUILD_SHA__: JSON.stringify(source ?? 'development'),
    // The sitemap's lastmod: when this exact build was made.
    __ROADMAP_BUILD_TIME__: JSON.stringify(
      command === 'build' ? new Date().toISOString() : null
    ),
    // Hosting observed by this build (scripts/generate-roadmap-data.mjs);
    // null outside a build, which the page shows as not verifiable.
    __ROADMAP_HOSTING__: JSON.stringify(
      command === 'build' && existsSync(HOSTING_FILE)
        ? snapshotForBuild(
            JSON.parse(readFileSync(HOSTING_FILE, 'utf8')),
            Date.now()
          )
        : null
    ),
    // Production builds and every merged PR, observed by this build
    // (src/insights/activity.ts); null shows them as not available.
    __ROADMAP_ACTIVITY__: JSON.stringify(
      command === 'build'
        ? activityForBuild(generated(ACTIVITY_FILE), Date.now())
        : null
    ),
    // Commits to main that curated deliverables cite, read from this
    // build's source commit (src/live/evidence.ts); null leaves every such
    // item on its fallback.
    __ROADMAP_EVIDENCE__: JSON.stringify(
      command === 'build'
        ? parseEvidence(generated(EVIDENCE_FILE), { time: Date.now(), source })
        : null
    ),
    // Open EduFest bugs this build observed (src/live/edufest-bugs.ts); null
    // shows the bug list as unavailable until the browser refresh reads it.
    __ROADMAP_EDUFEST_BUGS__: JSON.stringify(
      command === 'build' ? parseBugFeed(generated(BUGS_FILE)) : null
    ),
  };
}
