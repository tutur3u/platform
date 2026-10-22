import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  add: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.actor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
}));
vi.mock('@tuturuuu/supabase/next/realtime-log-actions', () => ({
  addRealtimeLog: mocks.add,
}));

import { submitRealtimeLog } from './realtime-actions.server';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: 'actor' });
  mocks.workspace.mockResolvedValue({
    id: 'canonical-workspace',
    joined: true,
  });
  mocks.add.mockResolvedValue(undefined);
});
describe('native shared realtime action ownership', () => {
  it('rejects unsigned and forged actor calls before supplier loading', async () => {
    mocks.actor.mockResolvedValueOnce(null);
    await expect(
      submitRealtimeLog(['tenant', null, 'info', 'message'])
    ).rejects.toThrow('Unauthorized');
    await expect(
      submitRealtimeLog(['tenant', 'other-actor', 'info', 'message'])
    ).rejects.toThrow('Unauthorized');
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it('denies nonmembers without writing and uses canonical actor/workspace after membership', async () => {
    mocks.workspace.mockResolvedValueOnce({
      id: 'other-tenant',
      joined: false,
    });
    await expect(
      submitRealtimeLog(['other-tenant', 'actor', 'info', 'message'])
    ).rejects.toThrow('Forbidden');
    expect(mocks.add).not.toHaveBeenCalled();
    await submitRealtimeLog([
      'tenant',
      null,
      'warn',
      'event',
      { cursor: 'original' },
    ]);
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      'canonical-workspace',
      'actor',
      'warn',
      'event',
      { cursor: 'original' }
    );
  });
  it('does not replay a failed supplier', async () => {
    mocks.add.mockRejectedValueOnce(new Error('unconfirmed log write'));
    await expect(
      submitRealtimeLog(['tenant', 'actor', 'warn', 'event'])
    ).rejects.toThrow('unconfirmed log write');
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });
});
