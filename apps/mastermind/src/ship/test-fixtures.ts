import type {
  ShipApp,
  ShipSnapshot,
  ShipSource,
} from '../../../web/src/lib/mastermind/ship/contract';

// Test support: a ship snapshot at NOW with every source current.

export const NOW = Date.parse('2026-11-22T10:00:40Z');
const at = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();
export const sha = (seed: string) => seed.repeat(40).slice(0, 40);

export function source(
  id: string,
  patch: Partial<ShipSource> = {}
): ShipSource {
  return {
    id,
    name: id,
    state: 'ok',
    checkedAt: at(40_000),
    okAt: at(40_000),
    retryAt: null,
    problem: null,
    ...patch,
  };
}

function app(
  id: ShipApp['id'],
  name: string,
  patch: Partial<ShipApp> = {}
): ShipApp {
  return {
    id,
    name,
    repository: 'tutur3u/platform',
    production: {
      release: {
        sha: sha('a'),
        deployedAt: '2026-11-21T16:58:00.000Z',
        environment: `${id}-production`,
        ci: 'success',
        deploy: 'ok',
      },
      worker: null,
    },
    staging: { release: null, worker: null },
    pending: { commits: 0, capped: false, oldestAt: null, headSha: sha('c') },
    sources: ['github:tutur3u/platform', 'cloudflare'],
    ...patch,
  };
}

export function snapshot(patch: Partial<ShipSnapshot> = {}): ShipSnapshot {
  return {
    version: 1,
    collectedAt: at(40_000),
    trigger: 'schedule',
    sources: [
      source('github:tutur3u/platform'),
      source('github:upskii/platform'),
      source('cloudflare'),
    ],
    apps: [
      app('web', 'Web', {
        production: {
          release: {
            sha: sha('a'),
            deployedAt: '2026-11-21T16:58:00.000Z',
            environment: 'cloudflare-production-web',
            ci: 'success',
            deploy: 'failed',
          },
          worker: null,
        },
        pending: {
          commits: 14,
          capped: false,
          oldestAt: at(30 * 3_600_000),
          headSha: sha('c'),
        },
      }),
      app('calendar', 'Calendar', {
        production: {
          release: {
            sha: sha('b'),
            deployedAt: '2026-11-21T11:10:00.000Z',
            environment: 'wave1-calendar-production',
            ci: 'failure',
            deploy: 'ok',
          },
          worker: {
            script: 'tuturuuu-calendar',
            versionId: '11111111-1111-4111-8111-111111111111',
            percentage: 100,
            deployedAt: '2026-11-21T11:11:00.000Z',
            sha: sha('d'),
          },
        },
      }),
      app('mail', 'Mail', {
        production: { release: null, worker: null },
        staging: {
          release: {
            sha: sha('e'),
            deployedAt: '2026-11-21T14:40:00.000Z',
            environment: 'wave1-mail-staging',
            ci: 'pending',
            deploy: 'running',
          },
          worker: null,
        },
        pending: null,
      }),
      app('mobile', 'iOS/Android', {
        staging: null,
        sources: ['github:tutur3u/platform'],
      }),
      app('upskii', 'Upskii', {
        repository: 'upskii/platform',
        sources: ['github:upskii/platform'],
      }),
      app('pktm', 'PKTM', {
        repository: null,
        production: { release: null, worker: null },
        pending: null,
        sources: [],
      }),
    ],
    ...patch,
  };
}
