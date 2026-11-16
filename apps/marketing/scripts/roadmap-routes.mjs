import { fileURLToPath } from 'node:url';
import { roadmapBuildDefines } from '@tuturuuu/roadmap-core/build-defines.ts';

/** The build-time switch for marketing's roadmap routes (D221). */
export const ROADMAP_ROUTES_FLAG = 'MARKETING_ROADMAP_ROUTES';

const own = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Marketing's roadmap routes, behind MARKETING_ROADMAP_ROUTES (off unless
 * exactly '1' at build time).
 *
 * On: src/router.tsx's `./routeTree.gen` import resolves to
 * roadmap/route-tree.ts (the generated tree plus the roadmap routes), and
 * the roadmap's build-time values are defined.
 * Off: nothing is resolved differently, so the router gets the generated
 * tree as before and no roadmap module enters the build.
 *
 * Both: `process.env.MARKETING_ROADMAP_ROUTES` is fixed at build time, so the
 * locale proxy's roadmap pass-through (src/proxy.ts) folds away when off.
 */
export function marketingRoadmapRoutes(env = process.env) {
  const enabled = env[ROADMAP_ROUTES_FLAG] === '1';
  const router = own('../src/router.tsx');
  const routeTree = own('../roadmap/route-tree.ts');
  return {
    name: 'marketing-roadmap-routes',
    enforce: 'pre',
    config(_, { command }) {
      const define = {
        [`process.env.${ROADMAP_ROUTES_FLAG}`]: JSON.stringify(
          enabled ? '1' : ''
        ),
      };
      if (!enabled) return { define };
      return { define: { ...define, ...roadmapBuildDefines(command, env) } };
    },
    resolveId(source, importer) {
      if (!enabled || !importer) return null;
      if (importer.split('?')[0] !== router) return null;
      return /^\.\/routeTree\.gen(?:\.ts)?$/u.test(source) ? routeTree : null;
    },
  };
}
