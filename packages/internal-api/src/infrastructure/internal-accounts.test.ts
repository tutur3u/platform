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
        nextCursor: null,
      })
    );

    await listInternalAccounts(
      {
        activeOnly: true,
        limit: 24,
        q: 'local@tuturuuu.com',
        sortBy: 'displayName',
        sortDirection: 'asc',
        verifiedOnly: true,
      },
      {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const searchParams = new URL(url).searchParams;
    expect(searchParams.get('q')).toBe('local@tuturuuu.com');
    expect(searchParams.get('activeOnly')).toBe('true');
    expect(searchParams.get('verifiedOnly')).toBe('true');
    expect(searchParams.get('sortBy')).toBe('displayName');
    expect(searchParams.get('sortDirection')).toBe('asc');
    expect(searchParams.get('limit')).toBe('24');
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
