import { describe, expect, it, vi } from 'vitest';
import {
  createInternalEmployee,
  listInternalAccounts,
  resetAccountPassword,
  updateInternalAccount,
} from './internal-accounts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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

  it('resets a platform account password by exact email', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        email: 'customer@example.com',
        message: 'Account password updated',
      })
    );
    const payload = {
      action: 'reset_password' as const,
      email: 'customer@example.com',
      newPassword: 'secure-temporary-password',
    };

    await resetAccountPassword(payload, {
      baseUrl: 'https://infra.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://infra.test/api/v1/infrastructure/internal-accounts',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});

it('creates an employee with the existing action header and an unchanged password', async () => {
  const response = {
    account: { id: 'staff', email: 'staff@tuturuuu.com', displayName: 'Staff' },
    status: 'created',
  };
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response, 201));
  const payload = {
    email: 'staff@tuturuuu.com',
    displayName: 'Staff',
    temporaryPassword: '  safe-password-123  ',
  };
  expect(
    await createInternalEmployee(payload, {
      baseUrl: 'https://infra.test',
      fetch: fetchMock as unknown as typeof fetch,
    })
  ).toEqual(response);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(
    'https://infra.test/api/v1/infrastructure/internal-accounts/employees'
  );
  expect(init.method).toBe('POST');
  expect(init.cache).toBe('no-store');
  expect(JSON.parse(init.body as string).temporaryPassword).toBe(
    payload.temporaryPassword
  );
  expect(new Headers(init.headers).get('x-tuturuuu-account-action')).toBe('1');
});

it.each([
  'account_creation_outcome_unknown',
  'employee_provisioning_pending',
] as const)(
  'preserves HTTP 202 pending outcome %s without retry',
  async (code) => {
    const response = {
      status: 'pending',
      code,
      message: 'Provisioning is pending.',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response, 202));
    const result = await createInternalEmployee(
      {
        email: 'staff@tuturuuu.com',
        displayName: 'Staff',
        temporaryPassword: 'safe-password-123',
      },
      {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);
