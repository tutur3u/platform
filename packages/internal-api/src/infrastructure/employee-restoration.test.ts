import { describe, expect, it, vi } from 'vitest';
import { restoreInternalEmployee } from './employee-restoration';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const payload = {
  confirmationEmail: 'staff@tuturuuu.com',
  expectedRevision: 7,
};

describe('employee restoration API', () => {
  it('binds the encoded target and sends the confirmed revision privately', async () => {
    const response = {
      status: 'restored',
      account: {
        id: 'staff-id',
        email: payload.confirmationEmail,
        displayName: 'Staff',
      },
      operationId: 'operation-id',
      revision: 8,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));

    expect(
      await restoreInternalEmployee('staff/id?other=1', payload, {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://infra.test/api/v1/infrastructure/internal-accounts/employees/staff%2Fid%3Fother%3D1/restore'
    );
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-tuturuuu-account-action')).toBe('1');
  });

  it.each([
    'employee_restore_outcome_unknown',
    'employee_restore_confirmation_pending',
  ] as const)('retains HTTP 202 %s without a second write', async (code) => {
    const response = {
      status: 'pending',
      code,
      operationId: 'operation-id',
      nextAction: 'inspect',
      message: 'Inspect this operation before taking another action.',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response, 202));
    const result = await restoreInternalEmployee('staff-id', payload, {
      baseUrl: 'https://infra.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toEqual(response);
    expect(result.status).toBe('pending');
    expect('account' in result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves a lost response as an error without retrying the mutation', async () => {
    const failure = new TypeError('Connection interrupted');
    const fetchMock = vi.fn().mockRejectedValue(failure);
    await expect(
      restoreInternalEmployee('staff-id', payload, {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a revision conflict without publishing a restored account', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { message: 'Employee state changed', code: 'revision_conflict' },
          409
        )
      );
    await expect(
      restoreInternalEmployee('staff-id', payload, {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
