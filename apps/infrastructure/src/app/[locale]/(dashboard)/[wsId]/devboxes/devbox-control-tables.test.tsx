import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DevboxAdminRunner } from '@/lib/devboxes/admin-store';
import { RunnersTable } from './devbox-control-tables';

vi.mock('./actions', () => ({
  releaseDevboxLeaseAction: vi.fn(),
  revokeDevboxRunnerAction: vi.fn(),
  setDevboxRunnerHeartbeatEnabledAction: vi.fn(),
  stopDevboxRunAction: vi.fn(),
}));

const translations: Record<string, string> = {
  'actions.disable_heartbeat': 'Disable heartbeat',
  'actions.enable_heartbeat': 'Enable heartbeat',
  'actions.revoke': 'Revoke',
  'columns.actions': 'Actions',
  'columns.environment': 'Environment',
  'columns.health': 'Health',
  'columns.heartbeat': 'Heartbeat',
  'columns.last_heartbeat': 'Last heartbeat',
  'columns.runner': 'Runner',
  'columns.tokens': 'Tokens',
  'empty.runners': 'No devbox runners found.',
  'health.never_seen': 'Registered, no heartbeat',
  'health.revoked': 'Revoked',
  'labels.active_total': 'active / total',
  'labels.heartbeat_disabled': 'Disabled',
  'labels.heartbeat_enabled': 'Enabled',
  'labels.total': 'total',
  'sections.runners': 'Runners',
  'sections.runners_description': 'Registered devbox runners.',
};

function t(key: string) {
  return translations[key] ?? key;
}

function runner(input: Partial<DevboxAdminRunner>): DevboxAdminRunner {
  return {
    actor_id: 'user-1',
    capabilities: {},
    created_at: '2026-07-04T00:00:00.000Z',
    heartbeat_enabled: false,
    id: 'runner-1',
    last_heartbeat_at: null,
    name: 'Runner',
    status: 'registered',
    updated_at: '2026-07-04T00:00:00.000Z',
    ...input,
  };
}

describe('RunnersTable', () => {
  it('shows heartbeat enablement state and admin actions', () => {
    render(
      <RunnersTable
        canManage
        now={new Date('2026-07-04T00:10:00.000Z')}
        runnerTokens={[]}
        runners={[
          runner({ id: 'runner-disabled', name: 'Disabled runner' }),
          runner({
            heartbeat_enabled: true,
            id: 'runner-enabled',
            name: 'Enabled runner',
          }),
        ]}
        t={t}
        wsId="root"
      />
    );

    const rows = screen.getAllByRole('row');
    const disabledRow = rows.find((row) =>
      within(row).queryByText('Disabled runner')
    );
    const enabledRow = rows.find((row) =>
      within(row).queryByText('Enabled runner')
    );

    expect(disabledRow).toBeDefined();
    expect(enabledRow).toBeDefined();
    expect(within(disabledRow!).getByText('Disabled')).toBeInTheDocument();
    expect(
      within(disabledRow!).getByRole('button', { name: /enable heartbeat/i })
    ).toBeEnabled();
    expect(within(enabledRow!).getByText('Enabled')).toBeInTheDocument();
    expect(
      within(enabledRow!).getByRole('button', { name: /disable heartbeat/i })
    ).toBeEnabled();
  });
});
