import { z } from 'zod';
import type { Endpoint } from './contracts';
import { comparePathPatterns } from './registry';

export type ReplayPolicy =
  | { sideEffects: 'read-only'; shadow: 'safe' }
  | { sideEffects: 'read-only' | 'writes' | 'unknown'; shadow: 'never' };

export function retainedReplayPolicy(path: string): ReplayPolicy {
  if (
    path === '/api/v1/exchange-rates' ||
    path === '/api/cron' ||
    path.startsWith('/api/cron/')
  ) {
    return { sideEffects: 'writes', shadow: 'never' };
  }
  if (path === '/api/health' || path === '/api/build-info') {
    return { sideEffects: 'read-only', shadow: 'safe' };
  }
  return { sideEffects: 'unknown', shadow: 'never' };
}

const safeReplayRoute = z.object({
  path: z.string().startsWith('/api/'),
  sideEffects: z.literal('read-only'),
  shadow: z.literal('safe'),
});

export function assertShadowReplayAllowed(
  route: unknown,
  method: string
): void {
  if (
    !['GET', 'HEAD'].includes(method) ||
    !safeReplayRoute.safeParse(route).success
  ) {
    throw new Error(
      'Shadow/replay requires an explicit read-only safe marker and GET/HEAD'
    );
  }
}

function patternsOverlap(worker: string, retained: string): boolean {
  const a = worker.split('/');
  const b = retained.split('/');
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const left = a[index];
    const right = b[index];
    if (right?.startsWith('{...')) {
      return right.endsWith('?}') || a.length > index;
    }
    if (left === undefined || right === undefined) return false;
    if (!left.startsWith('{') && !right.startsWith('{') && left !== right)
      return false;
  }
  return true;
}

const shape = (path: string) =>
  path
    .split('/')
    .map((segment) =>
      segment.startsWith('{...')
        ? segment.endsWith('?}')
          ? '{...?}'
          : '{...}'
        : segment.startsWith('{')
          ? '{}'
          : segment
    )
    .join('/');

export function validateRetainedCoverage(
  endpoints: readonly Pick<Endpoint, 'path' | 'aliases'>[],
  retained: readonly { path: string }[]
): void {
  const workerPaths = endpoints.flatMap((endpoint) => [
    endpoint.path,
    ...endpoint.aliases.map((alias) => alias.path),
  ]);
  const registered = new Set(workerPaths.map(shape));
  for (const worker of workerPaths) {
    for (const route of retained) {
      if (
        !registered.has(shape(route.path)) &&
        comparePathPatterns(worker, route.path) > 0 &&
        patternsOverlap(worker, route.path)
      ) {
        throw new Error(
          `Worker pattern ${worker} would capture unregistered retained route ${route.path}`
        );
      }
    }
  }
}
