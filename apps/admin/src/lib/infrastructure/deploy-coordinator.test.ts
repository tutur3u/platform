import { describe, expect, it, vi } from 'vitest';
import {
  CoordinatorRequestError,
  createCoordinatorClient,
  parseDeployAction,
  readCoordinatorConfig,
  readDeployProject,
  readDeployProjects,
} from './deploy-coordinator';

const ID = '00000000-0000-4000-8000-000000000001';
const config = { origin: 'https://deploy.example', token: 'operator-token' };
const project = {
  id: 'calendar',
  provider: 'vercel',
  workflows: {
    production: ['vercel-production-calendar.yaml'],
    staging: [
      {
        reusable: 'wave1-native-publish.yaml',
        caller: 'calendar-cloudflare.yaml',
      },
    ],
    preview: [],
  },
};
const deployment = {
  id: ID,
  project: 'calendar',
  environment: 'production',
  lane: 'default',
  seq: 1,
  kind: 'deploy',
  status: 'publishing',
  sha: 'a'.repeat(40),
  ref: 'refs/heads/production',
  plan: null,
  sourceDeploymentId: null,
  artifact: null,
  url: null,
  logsUrl: 'https://github.com/tutur3u/platform/actions/runs/1/attempts/1',
  actor: 'github:release-bot',
  runId: 1,
  supersededBy: null,
  attempt: {
    jobId: ID,
    attemptId: 'secret-attempt',
    workerId: '1:1:deploy',
    epoch: 3,
    targetLockId: 'calendar:production:default',
    stopRevision: 0,
    leaseDeadline: '2026-11-20T12:05:00.000Z',
    startedAt: 1,
    leaseDeadlineMs: 2,
  },
  reconciled: false,
  failureReason: null,
  closedBy: null,
  idempotencyKey: 'ci:1:1:default',
  bodyDigest: 'digest',
  createdAt: 1,
  updatedAt: 1,
  finishedAt: null,
};
const snapshot = {
  meta: { stopped: false, stopRevision: 0, stopReason: null, stoppedBy: null },
  lanes: [
    {
      lane: 'default',
      epoch: 3,
      lockDeploymentId: ID,
      held: false,
      holdReason: null,
      updatedAt: 1,
      current: null,
      deployments: [deployment],
    },
  ],
};

function coordinator(routes: Record<string, Response | (() => Response)>) {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    const route = routes[path];
    if (!route) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    return typeof route === 'function' ? route() : route.clone();
  });
}

describe('deployment coordinator config', () => {
  it('stays unconfigured until origin and token are both set', () => {
    expect(readCoordinatorConfig({})).toBeNull();
    expect(
      readCoordinatorConfig({ DEPLOY_COORDINATOR_ORIGIN: 'https://x.test' })
    ).toBeNull();
    expect(
      readCoordinatorConfig({
        DEPLOY_COORDINATOR_ORIGIN: 'https://x.test/',
        DEPLOY_COORDINATOR_OPERATOR_TOKEN: ' token ',
      })
    ).toEqual({ origin: 'https://x.test', token: 'token' });
  });

  it('accepts plain http only on loopback', () => {
    const token = { DEPLOY_COORDINATOR_OPERATOR_TOKEN: 't' };
    expect(
      readCoordinatorConfig({
        ...token,
        DEPLOY_COORDINATOR_ORIGIN: 'http://coordinator.example',
      })
    ).toBeNull();
    expect(
      readCoordinatorConfig({
        ...token,
        DEPLOY_COORDINATOR_ORIGIN: 'http://127.0.0.1:8787',
      })
    ).toEqual({ origin: 'http://127.0.0.1:8787', token: 't' });
  });
});

describe('deployment coordinator client', () => {
  it('sends the operator token and actor and strips grant secrets', async () => {
    const fetch = coordinator({
      '/v1/projects': Response.json({ projects: [project] }),
      '/v1/projects/calendar/environments/production': Response.json(snapshot),
      '/v1/projects/calendar/environments/staging': Response.json(
        { error: 'BUDGET_EXHAUSTED' },
        { status: 429 }
      ),
      '/v1/projects/calendar/environments/preview': Response.json({
        ...snapshot,
        lanes: [],
      }),
    });
    const result = await readDeployProject('user-1', 'calendar', config, fetch);
    const [, init] = fetch.mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer operator-token',
      'X-Deploy-Actor': 'user-1',
    });
    if (!result?.configured) throw new Error('expected a configured result');
    expect(result.project.workflows.staging).toEqual([
      'calendar-cloudflare.yaml → wave1-native-publish.yaml',
    ]);
    expect(result.environments.staging).toEqual({
      ok: false,
      error: 'BUDGET_EXHAUSTED',
    });
    const production = result.environments.production;
    if (!production.ok) throw new Error('expected production');
    const record = production.state.lanes[0]!.deployments[0]!;
    expect(record).toMatchObject({
      epoch: 3,
      leaseDeadline: '2026-11-20T12:05:00.000Z',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret-attempt');
    expect(serialized).not.toContain('idempotencyKey');
  });

  it('answers unconfigured, unknown projects and unreachable origins', async () => {
    expect(await readDeployProjects('user-1', null)).toEqual({
      configured: false,
    });
    const fetch = coordinator({
      '/v1/projects': Response.json({ projects: [project] }),
    });
    expect(
      await readDeployProject('user-1', 'missing', config, fetch)
    ).toBeNull();
    const down = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('fetch failed'));
    await expect(readDeployProjects('user-1', config, down)).rejects.toEqual(
      new CoordinatorRequestError(502, 'COORDINATOR_UNREACHABLE')
    );
  });

  it('maps each action to its coordinator route', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json({}));
    const client = createCoordinatorClient(config, 'user-1', fetch);
    await client.run('calendar', 'staging', {
      action: 'promote',
      deploymentId: ID,
    });
    await client.run('calendar', 'production', {
      action: 'resolve',
      deploymentId: ID,
      outcome: 'failed',
      url: null,
    });
    await client.run('calendar', 'preview', {
      action: 'release-hold',
      lane: 'feature/x',
    });
    await client.run('calendar', 'production', { action: 'stop', reason: 'x' });
    expect(
      fetch.mock.calls.map(([url, init]) => [
        new URL(String(url)).pathname,
        init?.body,
      ])
    ).toEqual([
      [
        `/v1/projects/calendar/environments/staging/deployments/${ID}/promote`,
        '{}',
      ],
      [
        `/v1/projects/calendar/environments/production/deployments/${ID}/resolve`,
        '{"outcome":"failed","url":null}',
      ],
      [
        '/v1/projects/calendar/environments/preview/hold/release',
        '{"lane":"feature/x"}',
      ],
      ['/v1/projects/calendar/environments/production/stop', '{"reason":"x"}'],
    ]);
  });

  it('reports a response that is not JSON as a bad gateway', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(readDeployProjects('user-1', config, fetch)).rejects.toEqual(
      new CoordinatorRequestError(502, 'COORDINATOR_BAD_RESPONSE')
    );
  });

  it('surfaces coordinator refusals with their code', async () => {
    const fetch = coordinator({});
    await expect(
      createCoordinatorClient(config, 'user-1', fetch).run(
        'calendar',
        'production',
        { action: 'cancel', deploymentId: ID }
      )
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('deployment action validation', () => {
  it('admits each action only where the coordinator allows it', () => {
    expect(
      parseDeployAction('staging', { action: 'promote', deploymentId: ID })
    ).toEqual({ action: 'promote', deploymentId: ID });
    expect(
      parseDeployAction('production', { action: 'promote', deploymentId: ID })
    ).toBeNull();
    expect(
      parseDeployAction('preview', { action: 'rollback', deploymentId: ID })
    ).toBeNull();
    expect(
      parseDeployAction('production', { action: 'cancel', deploymentId: 'x' })
    ).toBeNull();
    expect(
      parseDeployAction('production', {
        action: 'resolve',
        deploymentId: ID,
        outcome: 'succeeded',
        url: 'http://insecure.example',
      })
    ).toBeNull();
    expect(
      parseDeployAction('production', {
        action: 'resolve',
        deploymentId: ID,
        outcome: 'succeeded',
        url: 'https://user:secret@deploy.example',
      })
    ).toBeNull();
    expect(
      parseDeployAction('production', {
        action: 'resolve',
        deploymentId: ID,
        outcome: 'succeeded',
        url: 'https://deploy.example/x',
      })
    ).toMatchObject({ url: 'https://deploy.example/x' });
    expect(
      parseDeployAction('production', { action: 'release-hold', lane: 'x' })
    ).toEqual({ action: 'release-hold', lane: 'default' });
    expect(
      parseDeployAction('preview', { action: 'release-hold', lane: '../x' })
    ).toBeNull();
    expect(
      parseDeployAction('preview', { action: 'release-hold', lane: 'feat/x' })
    ).toEqual({ action: 'release-hold', lane: 'feat/x' });
    expect(
      parseDeployAction('production', { action: 'stop', reason: 'a\nb' })
    ).toBeNull();
    expect(parseDeployAction('production', { action: 'delete' })).toBeNull();
    expect(parseDeployAction('production', [])).toBeNull();
  });
});
