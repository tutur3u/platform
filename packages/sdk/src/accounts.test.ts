import { describe, expect, it, vi } from 'vitest';
import { AccountsClient, accountCommandSchema } from './accounts';

const targetId = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';

describe('accounts HTTPS client', () => {
  it('rejects insecure or credential-bearing origins before any request', () => {
    for (const baseUrl of [
      undefined,
      'http://localhost',
      'https://user:secret@example.com',
      'https://tuturuuu.com/path',
    ]) {
      expect(() => new AccountsClient({ baseUrl })).toThrow('HTTPS');
    }
  });

  it('rejects passwords, arbitrary test aliases and confirmation bypasses', () => {
    expect(
      accountCommandSchema.safeParse({
        action: 'create',
        operationId,
        email: 'fixture@tuturuuu.com',
        password: 'never-accepted',
      }).success
    ).toBe(false);
    expect(
      accountCommandSchema.safeParse({
        action: 'test-create',
        operationId,
        label: 'other',
      }).success
    ).toBe(false);
    expect(
      accountCommandSchema.safeParse({
        action: 'admin',
        operationId,
        targetId,
        enabled: true,
        yes: true,
      }).success
    ).toBe(false);
  });

  it('strips credentials and full emails from list output', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        accounts: [
          {
            id: targetId,
            disabled: false,
            test: true,
            maskedEmail: 'f***@tuturuuu.com',
            email: 'fixture@tuturuuu.com',
            token: 'synthetic-never-output',
          },
        ],
        nextCursor: null,
        session: 'synthetic-never-output',
      })
    );
    const client = new AccountsClient({
      baseUrl: 'https://tuturuuu.com',
      fetch,
    });
    const output = await client.execute({ action: 'list', limit: 25 });
    expect(JSON.stringify(output)).not.toContain('synthetic-never-output');
    expect(JSON.stringify(output)).not.toContain('fixture@');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not echo untrusted supplier errors or retry mutations', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ error: 'synthetic-private-value' }, { status: 500 })
    );
    const client = new AccountsClient({
      baseUrl: 'https://tuturuuu.com',
      fetch,
    });
    await expect(
      client.execute({
        action: 'disable',
        operationId,
        targetId,
        disabled: true,
      })
    ).rejects.toThrow('Use status to reconcile');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects wrong-target confirmation without sending', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new AccountsClient({
      baseUrl: 'https://tuturuuu.com',
      fetch,
    });
    await expect(
      client.execute({
        action: 'test-delete',
        operationId,
        targetId,
        confirmTarget: operationId,
      })
    ).rejects.toThrow('confirmation');
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('exchanges the runner credential only at the pinned origin and keeps the bearer private', async () => {
  const runnerCredential = `tdbx_${'a'.repeat(64)}`;
  const machineCredential = 'ttr_accounts_machine_fixture';
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ accessToken: machineCredential }))
    .mockResolvedValueOnce(
      Response.json({
        operationId,
        targetId,
        status: 'completed',
        accessToken: machineCredential,
      })
    );
  const client = await AccountsClient.forRunner(runnerCredential, fetch);
  const result = await client.execute({
    action: 'test-create',
    operationId,
    label: 'a1',
  });
  expect(result).toEqual({ operationId, targetId, status: 'completed' });
  const [exchange, mutation] = fetch.mock.calls;
  expect(String(exchange?.[0])).toBe(
    'https://tuturuuu.com/api/v1/admin/accounts/machine-token'
  );
  expect(new Headers(exchange?.[1]?.headers).get('authorization')).toBe(
    `Bearer ttr_${runnerCredential}`
  );
  expect(new Headers(mutation?.[1]?.headers).get('authorization')).toBe(
    `Bearer ${machineCredential}`
  );
  expect(mutation?.[1]?.redirect).toBe('error');
});
