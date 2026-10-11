import { describe, expect, it, vi } from 'vitest';
import {
  getInternalEmployeeManagement,
  reconcileInternalEmployee,
} from './employee-management';

const inspection = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'staff@tuturuuu.com',
  registryState: 'active',
  managedName: 'Staff',
  managementRoleLabel: null,
  revision: 8,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: {
    operationId: '20000000-0000-4000-8000-000000000001',
    revision: 7,
    phase: 'unknown',
  },
  recovery: { email: 'recovery@example.test', verified: false },
  providerState: 'confirmed_active',
};
const payload = {
  confirmationEmail: inspection.email,
  expectedRevision: inspection.operation.revision,
  operationId: inspection.operation.operationId,
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('employee management API', () => {
  it('reads private detail without activating or submitting recovery data', async () => {
    const detail = {
      ...inspection,
      nextAction: 'inspect',
      providerReadAt: '2026-10-08T00:00:00Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(response(detail));
    expect(
      await getInternalEmployeeManagement('staff/id?other=1', {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).toEqual(detail);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://infra.test/api/v1/infrastructure/internal-accounts/employees/staff%2Fid%3Fother%3D1'
    );
    expect(init.cache).toBe('no-store');
    expect(init.body).toBeUndefined();
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('keeps an observation distinct from restored and retains the original operation revision', async () => {
    const observed = {
      status: 'observed',
      observation: inspection,
      nextAction: 'inspect',
    };
    const fetchMock = vi.fn().mockResolvedValue(response(observed));
    const result = await reconcileInternalEmployee(inspection.id, payload, {
      baseUrl: 'https://infra.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toEqual(observed);
    expect('account' in result).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://infra.test/api/v1/infrastructure/internal-accounts/employees/${inspection.id}/reconcile`
    );
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(new Headers(init.headers).get('x-tuturuuu-account-action')).toBe(
      '1'
    );
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retains an uncertain inspection without issuing another provider action', async () => {
    const pending = {
      status: 'pending',
      code: 'employee_restore_confirmation_pending',
      operationId: payload.operationId,
      nextAction: 'inspect',
      message: 'Inspect this operation before taking another action.',
    };
    const fetchMock = vi.fn().mockResolvedValue(response(pending, 202));
    expect(
      await reconcileInternalEmployee(inspection.id, payload, {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).toEqual(pending);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([403, 409])(
    'preserves definitive %s inspection errors',
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          response(
            { message: 'Employee management could not be verified' },
            status
          )
        );
      await expect(
        reconcileInternalEmployee(inspection.id, payload, {
          baseUrl: 'https://infra.test',
          fetch: fetchMock as unknown as typeof fetch,
        })
      ).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it('never retries a lost reconciliation response', async () => {
    const error = new TypeError('Connection interrupted');
    const fetchMock = vi.fn().mockRejectedValue(error);
    await expect(
      reconcileInternalEmployee(inspection.id, payload, {
        baseUrl: 'https://infra.test',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
