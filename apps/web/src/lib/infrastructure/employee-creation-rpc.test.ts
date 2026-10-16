import { describe, expect, it, vi } from 'vitest';
import { createEmployeeRuntimeRpc } from './employee-creation-rpc';

vi.mock('server-only', () => ({}));
const actor = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const operation = {
  actorUserId: actor,
  operationId,
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  targetUserId: '00000000-0000-4000-8000-000000000003',
  phase: 'reserved',
  version: 0,
  leaseId: '00000000-0000-4000-8000-000000000004',
  leaseExpiresAt: Date.now() + 60_000,
  revoked: false,
  lastReceipt: null,
};
const identity = {
  actorUserId: actor,
  operationId,
  email: operation.email,
  displayName: operation.displayName,
};
describe('employee fixed RPC commit observation', () => {
  it('requires the exact persisted snapshot after a successful mutation response', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'claimed', operation }))
      .mockResolvedValueOnce(Response.json({ operation, account: null }));
    const client = createEmployeeRuntimeRpc({
      url: 'https://project.supabase.co',
      key: 'synthetic',
      fetch: transport,
    });
    expect(await client.rpc.claim(identity)).toEqual({
      kind: 'claimed',
      operation,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    const calls = transport.mock.calls.map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    }));
    expect(calls.map((v) => v.path)).toEqual([
      '/rest/v1/rpc/employee_creation_operation_claim',
      '/rest/v1/rpc/employee_creation_runtime_inspect',
    ]);
    expect(calls[0]?.headers.get('Content-Profile')).toBe('private');
    expect(calls[0]?.headers.get('Prefer')).toBe('tx=commit');
    expect(calls[0]?.body).toEqual({
      p_actor_id: actor,
      p_operation_id: operationId,
      p_email: operation.email,
      p_name: operation.displayName,
    });
  });
  it.each([
    null,
    { ...operation, version: 1 },
    { ...operation, targetUserId: actor },
  ])(
    'cannot authorize provider creation from uncommitted or different state',
    async (persisted) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ kind: 'claimed', operation }))
        .mockResolvedValueOnce(
          Response.json({ operation: persisted, account: null })
        );
      const client = createEmployeeRuntimeRpc({
        url: 'https://project.supabase.co',
        key: 'synthetic',
        fetch: transport,
      });
      await expect(client.rpc.claim(identity)).rejects.toMatchObject({
        code: 'employee_commit_unconfirmed',
      });
      expect(transport).toHaveBeenCalledTimes(2);
    }
  );
  it('does not retry when the mutation response is lost', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('lost response'));
    const client = createEmployeeRuntimeRpc({
      url: 'https://project.supabase.co',
      key: 'synthetic',
      fetch: transport,
    });
    await expect(client.rpc.claim(identity)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects rollback acknowledgements and ignores raw upstream diagnostics', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { kind: 'claimed', operation, message: 'private diagnostic' },
          { headers: { 'Preference-Applied': 'tx=rollback' } }
        )
      );
    const client = createEmployeeRuntimeRpc({
      url: 'https://project.supabase.co',
      key: 'synthetic',
      fetch: transport,
    });
    await expect(client.rpc.claim(identity)).rejects.toThrow(
      'employee_rpc_unavailable'
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not accept SQL finalization before its account state is persisted', async () => {
    const account = {
      id: operation.targetUserId,
      email: operation.email,
      displayName: operation.displayName,
      status: 'pending',
    };
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json({ operation, account: null }));
    const client = createEmployeeRuntimeRpc({
      url: 'https://project.supabase.co',
      key: 'synthetic',
      fetch: transport,
    });
    await expect(
      client.provision(
        { ...operation, phase: 'finalize_attempted' },
        'finalize'
      )
    ).rejects.toMatchObject({ code: 'employee_commit_unconfirmed' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
