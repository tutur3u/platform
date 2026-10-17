import { describe, expect, it, vi } from 'vitest';
import { createEmployeeAddressMigrationJournal } from './employee-address-migration-rpc';

const request = {
  actorId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  operationId: '00000000-0000-4000-8000-000000000003',
  expectedRevision: 0,
  sourceAddress: 'person@xwf.tuturuuu.com',
  destinationAddress: 'person@tuturuuu.com',
};
const binding = {
  ...request,
  immutableFingerprint: 'a'.repeat(64),
  providerIdentityFingerprint: 'b'.repeat(64),
};
function setup() {
  const authorize = vi.fn(async () => true);
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(true));
  const input = {
    url: 'http://127.0.0.1:54321',
    key: 'disposable-test-key',
    request,
    authorize,
    fetch: fetcher,
  };
  return {
    input,
    authorize,
    fetcher,
    journal: createEmployeeAddressMigrationJournal(input),
  };
}

describe('address migration RPC supplier', () => {
  it('uses private committed transactions and returns sole claim acknowledgement', async () => {
    const { journal, fetcher, authorize } = setup();
    expect(await journal.claimAttempt(binding, request.operationId)).toBe(true);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      'http://127.0.0.1:54321/rest/v1/rpc/employee_address_migration'
    );
    expect(options).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
      headers: { Prefer: 'tx=commit', 'Content-Profile': 'private' },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      p_action: 'claim',
      p_request: binding,
      p_attempt_id: request.operationId,
    });
    expect(authorize).toHaveBeenCalledWith(request.actorId);
  });
  it('rejects tuple substitution before any HTTP call', async () => {
    const { journal, fetcher } = setup();
    await expect(
      journal.reserve({ ...binding, userId: request.actorId })
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rechecks revoked authority for every transaction', async () => {
    const { journal, authorize, fetcher } = setup();
    await journal.reserve(binding);
    authorize.mockResolvedValue(false);
    await expect(
      journal.claimAttempt(binding, request.operationId)
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'rollback', 'malformed', 'oversized'])(
    'never retries unknown %s outcomes',
    async (kind) => {
      const { journal, fetcher } = setup();
      fetcher.mockImplementation(async () => {
        if (kind === 'network') throw new Error('lost acknowledgement');
        if (kind === 'rollback')
          return Response.json(true, {
            headers: { 'preference-applied': 'tx=rollback' },
          });
        return new Response(kind === 'oversized' ? ' '.repeat(131073) : '{');
      });
      await expect(journal.reserve(binding)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it('independently parses committed inspections and rejects malformed receipts', async () => {
    const { journal, fetcher } = setup();
    fetcher.mockResolvedValue(
      Response.json({
        authorized: true,
        revision: 0,
        immutableFingerprint: binding.immutableFingerprint,
        providerIdentityFingerprint: binding.providerIdentityFingerprint,
        sourceVerified: true,
        addressOwnership: 'same_identity',
        record: { binding, phase: 'reserved', attemptId: null },
      })
    );
    expect(
      ((await journal.inspect(binding)) as { record: unknown }).record
    ).toEqual({ binding, phase: 'reserved', attemptId: null });
    fetcher.mockResolvedValue(Response.json({ authorized: true }));
    await expect(journal.inspect(request)).rejects.toThrow();
  });
  it.each([
    'https://user:pass@example.test',
    'http://example.test',
    'https://example.test/project',
    'https://example.test/?key=private',
  ])('rejects unsafe configuration %s', (url) => {
    const { input } = setup();
    expect(() =>
      createEmployeeAddressMigrationJournal({ ...input, url })
    ).toThrow();
  });
});
