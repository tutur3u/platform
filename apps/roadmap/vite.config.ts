import { existsSync, readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { snapshotForBuild } from './src/live/hosting.ts';
import { activityForBuild } from './src/insights/activity.ts';
import { voidPlugin } from 'void';

const HOSTING_FILE = new URL('./.generated/hosting.json', import.meta.url);
const ACTIVITY_FILE = new URL('./.generated/activity.json', import.meta.url);

/** A generated JSON file, or null when it is absent or unreadable. */
function generated(file: URL): unknown {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

export default defineConfig(({ command }) => {
  const source = process.env.ROADMAP_SOURCE_SHA ?? process.env.GITHUB_SHA;
  if (command === 'build' && !/^[a-f0-9]{40}$/.test(source ?? '')) {
    throw new Error(
      'A roadmap build requires its immutable ROADMAP_SOURCE_SHA'
    );
  }
  return {
    base: '/roadmap/',
    define: {
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
    },
    plugins: [
      voidPlugin(),
      tailwindcss(),
      tanstackStart({
        router: { basepath: '/roadmap' },
        serverFns: { base: '/roadmap/_serverFn' },
      }),
      react(),
    ],
  };
});
