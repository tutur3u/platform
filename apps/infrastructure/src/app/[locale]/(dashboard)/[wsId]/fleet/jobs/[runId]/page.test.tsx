import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-10-25T05:00:00.000Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

const mocks = vi.hoisted(() => ({
  canManage: false,
  detail: null as unknown,
}));

const run = {
  actor_id: 'actor',
  command: ['bun', 'type-check'],
  completed_at: null,
  created_at: ago(1500),
  exit_code: null,
  id: '00000000-0000-4000-8000-000000000001',
  lease_id: 'lease',
  preview_ports: [],
  runner_id: 'runner-1',
  started_at: ago(1400),
  status: 'running',
  timeout_seconds: 600,
  updated_at: ago(1300),
};

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../devboxes/actions', () => ({
  stopDevboxRunAction: { bind: () => async () => {} },
}));
vi.mock('@/lib/fleet/run-detail', () => ({
  getFleetRunDetail: async () => mocks.detail,
  RUN_LOG_LIMIT: 500,
}));
vi.mock('../../_components/fleet-data', () => ({
  loadFleetPage: async () => ({
    canManage: mocks.canManage,
    locale: 'en',
    now,
    result: {
      ok: true,
      snapshot: {
        runnerTokens: [
          { created_at: '', id: 't', revoked_at: null, runner_id: 'runner-1' },
        ],
        runners: [
          {
            actor_id: 'actor',
            capabilities: null,
            created_at: ago(9999),
            enabled_features: {},
            heartbeat_enabled: true,
            id: 'runner-1',
            last_heartbeat_at: ago(22 * 60),
            name: 'sonha',
            resource_limits: null,
            status: 'online',
            updated_at: ago(22 * 60),
          },
        ],
      },
    },
    t: (key: string) => key,
  }),
}));

async function renderPage() {
  const { default: Page } = await import('./page');
  render(
    await Page({
      params: Promise.resolve({ runId: run.id, wsId: 'internal' }),
    })
  );
}

describe('fleet run page', () => {
  beforeEach(() => {
    mocks.canManage = false;
    mocks.detail = {
      events: [
        {
          created_at: ago(1390),
          event_type: 'log',
          id: 'e1',
          message: 'checking 42 projects',
        },
        {
          created_at: ago(1380),
          event_type: 'error',
          id: 'e2',
          message: 'boom',
        },
      ],
      eventsTruncated: false,
      run,
    };
  });

  it('reports an active run on a disconnected machine as outcome unknown', async () => {
    await renderPage();

    expect(screen.getByText('run_state.outcome_unknown')).toBeTruthy();
    expect(screen.getByText('jobs.recovery.outcome_unknown')).toBeTruthy();
    expect(screen.queryByText('run_state.running')).toBeNull();
    expect(screen.getByText('checking 42 projects')).toBeTruthy();
    expect(
      screen.getByText('boom').closest('li')?.getAttribute('data-tone')
    ).toBe('critical');
    expect(
      screen.getByRole('link', { name: 'sonha' }).getAttribute('href')
    ).toBe('/internal/fleet/machines/runner-1');
  });

  it('offers stop only to administrators', async () => {
    await renderPage();
    expect(
      screen.queryByRole('button', { name: 'jobs.detail.stop' })
    ).toBeNull();

    mocks.canManage = true;
    document.body.innerHTML = '';
    await renderPage();
    expect(
      screen.getByRole('button', { name: 'jobs.detail.stop' })
    ).toBeTruthy();
  });

  it('shows a not-found state for an unknown run', async () => {
    mocks.detail = null;
    await renderPage();

    expect(screen.getByText('jobs.detail.not_found_title')).toBeTruthy();
  });
});
