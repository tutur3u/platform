/**
 * Marketing's generated route tree plus the roadmap routes. With
 * MARKETING_ROADMAP_ROUTES=1, scripts/roadmap-routes.mjs resolves
 * src/router.tsx's `./routeTree.gen` import to this module; otherwise the
 * router gets the generated tree unchanged and this module is never built.
 */
import type { AnyRoute } from '@tanstack/react-router';
import { routeTree as generated } from '../src/routeTree.gen';
import { roadmapRoutes } from './routes';

generated.addChildren([
  ...((generated.children ?? []) as AnyRoute[]),
  ...roadmapRoutes(generated),
]);

export const routeTree = generated;
