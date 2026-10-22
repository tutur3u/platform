import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from '../client';
import {
  createInternalEmployee,
  EmployeeCreationNotAdmittedError,
  EmployeeCreationPayloadSchema,
  getEmployeeCreationAvailability,
} from './employee-creation';

const operationId = '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'Synthetic-Pass-123!',
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

it('observes the original operation with one uncached GET and binds completion identity', async () => {
  const { getInternalEmployeeCreationOperation } = await import(
    './employee-creation'
  );
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(reply));
  expect(
    await getInternalEmployeeCreationOperation(
      { operationId, ...payload },
      { fetch: transport }
    )
  ).toEqual(reply);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]?.[0]).toContain(
    `/employees/operations/${operationId}`
  );
  expect(transport.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  transport.mockResolvedValue(
    Response.json({
      ...reply,
      account: { ...reply.account, displayName: 'Other' },
    })
  );
  await expect(
    getInternalEmployeeCreationOperation(
      { operationId, ...payload },
      { fetch: transport }
    )
  ).rejects.toThrow('identity mismatch');
});

it('refuses a length-valid weak password locally without any HTTP request', async () => {
  const transport = vi.fn<typeof fetch>();
  await expect(
    createInternalEmployee(
      { ...payload, temporaryPassword: 'lowercase-only-123!' },
      { operationId, fetch: transport }
    )
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});

it('never accepts observation lineage fields as a CREATE mutation result', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        ...reply,
        account: {
          ...reply.account,
          displayName: 'Renamed',
          creationDisplayName: payload.displayName,
        },
      },
      { status: 201 }
    )
  );
  await expect(
    createInternalEmployee(payload, {
      operationId,
      fetch: transport,
      baseUrl: 'https://infra.test',
    })
  ).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
});

const pending = {
  status: 'pending',
  operationId,
  code: 'account_creation_outcome_unknown',
  nextAction: 'inspect',
};
const conflict = {
  status: 'conflict',
  operationId,
  code: 'employee_account_conflict',
  nextAction: 'inspect',
};
it.each(
  [201, 202, 409, 200].flatMap((status) =>
    [reply, pending, conflict]
      .filter(
        (body) =>
          !(
            (status === 201 && body.status === 'created') ||
            (status === 202 && body.status === 'pending') ||
            (status === 409 && body.status === 'conflict')
          )
      )
      .map((body) => ({ status, body }))
  )
)(
  'rejects mismatched HTTP $status / $body.status without replay',
  async ({ status, body }) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body, { status }));
    await expect(
      createInternalEmployee(payload, { operationId, fetch: transport })
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  }
);

const actorUserId = '11111111-1111-4111-8111-111111111111';
it.each([400, 503])(
  'preserves HTTP %s with a non-JSON body without qualifying nonadmission or replaying',
  async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('upstream unavailable', { status }));
    const request = createInternalEmployee(payload, {
      operationId,
      actorUserId,
      fetch: transport,
      baseUrl: 'https://infra.test',
    });
    await expect(request).rejects.toBeInstanceOf(InternalApiError);
    await expect(request).rejects.toMatchObject({
      name: 'InternalApiError',
      status,
      message: `Internal API request failed: ${status}`,
    });
    await expect(request).rejects.not.toBeInstanceOf(
      EmployeeCreationNotAdmittedError
    );
    await expect(request).rejects.not.toHaveProperty('outcome');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe(
      'https://infra.test/api/v1/infrastructure/internal-accounts/employees'
    );
    const init = transport.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(operationId);
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  }
);
const notAdmitted = {
  status: 'not_admitted',
  code: 'employee_creation_not_admitted',
  reason: 'unavailable',
  phase: 'before_claim',
  targetUserId: null,
  actorUserId,
  operationId,
  email: payload.email,
  displayName: payload.displayName,
};
it('exposes only exact request-bound preclaim nonadmission as a typed error', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(notAdmitted, { status: 503 }));
  await expect(
    createInternalEmployee(payload, {
      operationId,
      fetch: transport,
      actorUserId,
    })
  ).rejects.toMatchObject({
    name: 'EmployeeCreationNotAdmittedError',
    outcome: notAdmitted,
  });
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
  {},
  { actorUserId: operationId },
  { operationId: actorUserId },
  { email: 'other@tuturuuu.com' },
  { displayName: 'Other' },
  { phase: 'reserved' },
  { targetUserId: actorUserId },
  { extra: true },
])('does not qualify unbound nonadmission %j', async (change) => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ ...notAdmitted, ...change }, { status: 503 })
    );
  await expect(
    createInternalEmployee(payload, {
      operationId,
      fetch: transport,
      ...(Object.keys(change).length ? { actorUserId } : {}),
    })
  ).rejects.not.toHaveProperty('outcome');
  expect(transport).toHaveBeenCalledTimes(1);
});

it.each([
  { status: 201, body: reply },
  { status: 202, body: pending },
  { status: 409, body: conflict },
])('accepts exact HTTP $status / $body.status', async ({ status, body }) => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status }));
  expect(
    await createInternalEmployee(payload, { operationId, fetch: transport })
  ).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
  { status: 400, reason: 'unavailable' },
  { status: 503, reason: 'invalid_input' },
  { status: 201, reason: 'unavailable' },
  { status: 202, reason: 'unavailable' },
  { status: 409, reason: 'unavailable' },
])(
  'does not qualify nonadmission at HTTP $status with reason $reason',
  async ({ status, reason }) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...notAdmitted, reason }, { status }));
    await expect(
      createInternalEmployee(payload, {
        operationId,
        fetch: transport,
        actorUserId,
      })
    ).rejects.not.toHaveProperty('outcome');
    expect(transport).toHaveBeenCalledTimes(1);
  }
);
