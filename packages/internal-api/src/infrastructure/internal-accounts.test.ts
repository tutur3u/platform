import { describe, expect, it, vi } from 'vitest';
import {
  listInternalAccounts,
  updateInternalAccount,
} from './internal-accounts';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('internal account API helpers', () => {
  it('encodes the account search through the infrastructure API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        accounts: [],
        count: 0,
      })
    );

    await listInternalAccounts(
      { q: 'local@tuturuuu.com' },
      {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('q')).toBe('local@tuturuuu.com');
    expect(init.cache).toBe('no-store');
  });

  it('sends typed confirmation for account mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        account: { id: 'local-user' },
        message: 'Internal account access disabled',
      })
    );
    const payload = {
      action: 'disable_access' as const,
      confirmationEmail: 'local@tuturuuu.com',
    };

    await updateInternalAccount('local-user', payload, {
      baseUrl: 'https://infra.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://infra.test/api/v1/infrastructure/internal-accounts/local-user',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
  });
});
