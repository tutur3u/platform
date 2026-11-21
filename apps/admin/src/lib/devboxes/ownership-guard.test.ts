import { beforeEach, describe, expect, it, vi } from 'vitest';

const { admin, notify } = vi.hoisted(() => ({
  admin: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@tuturuuu/utils/devbox-control', () => ({ notifyDevboxRun: notify }));

import { createDevboxLease, createDevboxRun, updateDevboxEnv } from './store';

describe('devbox ownership preflight', () => {
  const writes: string[] = [];
  let rejection: string | null;
  const rpc = vi.fn(async () => ({
    data: null,
    error: rejection ? { message: rejection } : null,
  }));
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    rejection = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: async () => ({ data: [], error: null }),
    };
    admin.mockResolvedValue({
      schema: () => ({
        rpc,
        from: (table: string) => ({
          ...builder,
          insert: async () => {
            writes.push(table);
            return { error: null };
          },
        }),
      }),
    });
  });
  it.each(['missing', 'foreign'])(
    'rejects %s leases before any run insert',
    async () => {
      rejection = 'Devbox lease not found.';
      await expect(
        createDevboxRun({ actorId: 'a', leaseId: 'b', command: ['echo'] })
      ).rejects.toMatchObject({ status: 404 });
      expect(writes).toEqual([]);
      expect(notify).not.toHaveBeenCalled();
    }
  );
  it('rejects env revisions on foreign leases before writing', async () => {
    rejection = 'Devbox lease not found.';
    await expect(
      updateDevboxEnv({ actorId: 'a', leaseId: 'b', updates: { KEY: 'value' } })
    ).rejects.toMatchObject({ status: 404 });
    expect(writes).toEqual([]);
  });
  it('rejects inactive leases with 409', async () => {
    rejection = 'Devbox lease is not active.';
    await expect(
      createDevboxRun({ actorId: 'a', leaseId: 'b', command: ['echo'] })
    ).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });
  it('rejects foreign runner pins before creating either a lease or run', async () => {
    rejection = 'Devbox runner is not available to this actor.';
    await expect(
      createDevboxRun({ actorId: 'a', runnerId: 'b', command: ['echo'] })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createDevboxLease({ actorId: 'a', runnerId: 'b' })
    ).rejects.toMatchObject({ status: 403 });
    expect(writes).toEqual([]);
  });
  it('allows owned active leases and env revisions', async () => {
    await expect(
      createDevboxRun({ actorId: 'a', leaseId: 'owned', command: ['echo'] })
    ).resolves.toMatchObject({ lease: { id: 'owned' } });
    await updateDevboxEnv({ actorId: 'a', leaseId: 'owned' });
    expect(writes).toEqual(['devbox_runs', 'devbox_env_revisions']);
  });
  it('fails closed when ownership enforcement is unavailable', async () => {
    rejection = 'function private.check_devbox_write_ownership does not exist';
    await expect(
      createDevboxLease({ actorId: 'a', runnerId: 'b' })
    ).rejects.toMatchObject({ status: 503 });
    expect(writes).toEqual([]);
  });
});
