import type { FleetDigest } from '@tuturuuu/internal-api/fleet';
import type { LiveFleetAccess } from './model';

const observer: LiveFleetAccess = {
  enabled: true,
  tier: 'observer',
  projects: ['web', 'mobile'],
  capabilities: ['status.read', 'ask', 'intent.request'],
  stopped: false,
};

const steerer: LiveFleetAccess = {
  ...observer,
  tier: 'steerer',
  capabilities: [
    'status.read',
    'ask',
    'work.create',
    'work.redirect',
    'priority.set',
    'comment',
    'approve.low',
  ],
};

const owner: LiveFleetAccess = {
  ...steerer,
  tier: 'owner',
  capabilities: [
    ...steerer.capabilities,
    'intent.request',
    'approve.deploy',
    'approve.production_change',
    'lane.pause',
    'access.grant',
  ],
};

const digest: FleetDigest = {
  sections: [
    {
      projectKey: 'web',
      generatedAt: '2026-11-21T03:00:00.000Z',
      receivedAt: '2026-11-21T03:00:05.000Z',
      stale: true,
      lanes: [
        {
          lane: 'Search',
          state: 'running',
          eta: '2026-11-23T10:00:00.000Z',
          shortSha: 'abc1234',
          blockerCodes: [],
        },
        { lane: 'Checkout', state: 'blocked', blockerCodes: ['review'] },
        {
          lane: 'Billing',
          state: 'ready',
          eta: '2026-11-22T08:00:00.000Z',
          readinessItem: 'Release notes',
          blockerCodes: [],
        },
      ],
    },
  ],
  totals: {
    projects: 1,
    lanes: 3,
    byState: {
      planned: 0,
      running: 1,
      blocked: 1,
      ready: 1,
      done: 0,
      paused: 0,
    },
  },
};

export const fixtures = { observer, steerer, owner, digest };
