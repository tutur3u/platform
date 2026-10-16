import { describe, expect, it, vi } from 'vitest';
import {
  createInternalEmployee,
  EmployeeCreationPayloadSchema,
  getEmployeeCreationAvailability,
} from './employee-creation';

const operationId = '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'temporary-pass-123',
};
const reply = {
  status: 'created',
  operationId,
  account: {
    id: 'e0dfe613-9e8a-4fa4-8f52-fd881aa2e9f2',
    email: payload.email,
    displayName: payload.displayName,
  },
};
describe('strict employee client', () => {
  it('returns a typed conflict from HTTP 409 without repeating creation', async () => {
    const conflict = {
      status: 'conflict',
      operationId,
      code: 'employee_operation_payload_conflict',
      nextAction: 'inspect',
    };
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(conflict, { status: 409 }));
    expect(
      await createInternalEmployee(payload, {
        operationId,
        fetch: transport,
        baseUrl: 'https://infra.test',
      })
    ).toEqual(conflict);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('sends one stable operation key without putting it or actor into password body', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(reply, { status: 201 }));
    expect(
      await createInternalEmployee(payload, {
        operationId,
        fetch: transport,
        baseUrl: 'https://infra.test',
      })
    ).toEqual(reply);
    expect(transport).toHaveBeenCalledTimes(1);
    const init = transport.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(operationId);
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });
  it.each([401, 403, 503])('preserves HTTP %s errors', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: 'unavailable' }, { status }));
    await expect(
      createInternalEmployee(payload, {
        operationId,
        fetch: transport,
        baseUrl: 'https://infra.test',
      })
    ).rejects.toMatchObject({ status });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...reply, operationId: 'e0dfe613-9e8a-4fa4-8f52-fd881aa2e9f2' },
    { ...reply, account: { ...reply.account, email: 'other@tuturuuu.com' } },
    { ...reply, password: 'private' },
    {
      status: 'pending',
      operationId,
      code: 'not-a-known-state',
      nextAction: 'inspect',
    },
  ])('rejects malformed acknowledgements without retries', async (value) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(value));
    await expect(
      createInternalEmployee(payload, {
        operationId,
        fetch: transport,
        baseUrl: 'https://infra.test',
      })
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects unavailable shape drift instead of enabling creation', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ available: true, extra: 'private' }));
    await expect(
      getEmployeeCreationAvailability({
        fetch: transport,
        baseUrl: 'https://infra.test',
      })
    ).rejects.toThrow();
  });
  it.each([
    'staff@tuturuuu.com.evil',
    'staff@sub.tuturuuu.com',
    'staff@tuturuuu.co',
    'staff@tuturuuu.com@evil.test',
  ])('keeps staff creation exact-domain: %s', (email) => {
    expect(
      EmployeeCreationPayloadSchema.safeParse({ ...payload, email }).success
    ).toBe(false);
  });
});
