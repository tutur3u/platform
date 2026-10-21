import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(),
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));
vi.mock('./employee-request-origin', () => ({
  employeeRequestOrigin: (request: Request) => new URL(request.url).origin,
}));

import { makeEmployeeRejectionBoundary } from './employee-rejection-boundary';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eligible = {
  status: 'eligible',
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
  expectedVersion: 2,
};
const adjudication = {
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: eligible.email,
  displayName: eligible.displayName,
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
  expectedVersion: 2,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
  reason: 'administrator_adjudicated_terminal_auth_rejection',
  attestation: {
    kind: 'administrator-adjudication-v1',
    terminalAuthRejection: true,
    noRequestInFlight: true,
    absenceIsNotRejectionProof: true,
    acceptResponsibility: true,
  },
};
const body = {
  workspaceId: '00000000-0000-0000-0000-000000000000',
  adjudication,
};
const ready = {
  ...eligible,
  status: 'retry_ready',
  expectedVersion: 3,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
};
const operation = {
  actorUserId: id(1),
  operationId: id(2),
  targetUserId: id(3),
  email: eligible.email,
  displayName: eligible.displayName,
  phase: 'reserved',
  version: 3,
  leaseId: id(7),
  leaseExpiresAt: 0,
  revoked: false,
  lastReceipt: null,
};
const authorize = vi.fn();
const inspect = vi.fn();
const adjudicate = vi.fn();
const connect = vi.fn();
function run(
  value: unknown = body,
  headers: Record<string, string> = {},
  method = 'POST'
) {
  return makeEmployeeRejectionBoundary({ authorize, connect })(
    new Request('https://web.test/rejection', {
      method,
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://web.test',
        'sec-fetch-site': 'same-origin',
        'x-tuturuuu-account-action': '1',
        ...headers,
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(value) }),
    }),
    id(2)
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ authorized: true, actorUserId: id(1) });
  inspect.mockResolvedValueOnce(eligible).mockResolvedValue(ready);
  adjudicate.mockResolvedValue({ kind: 'adjudicated', operation });
  connect.mockResolvedValue({ inspect, adjudicate });
});
it('mutates only after exact tuple validation and returns committed audit readback', async () => {
  const result = await run();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(ready);
  expect(authorize).toHaveBeenCalledTimes(3);
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(adjudicate.mock.calls[0]?.[0]).toMatchObject({
    p_actor_id: id(1),
    p_operation_id: id(2),
    p_event_id: id(6),
  });
});
it('denies anonymous requests before connecting', async () => {
  authorize.mockResolvedValue({ authorized: false, status: 401 });
  expect((await run()).status).toBe(401);
  expect(connect).not.toHaveBeenCalled();
});
it('denies missing action headers, foreign origins, other workspaces and malformed attestations', async () => {
  expect((await run(body, { 'x-tuturuuu-account-action': '' })).status).toBe(
    403
  );
  expect((await run(body, { origin: 'https://foreign.test' })).status).toBe(
    403
  );
  expect((await run({ ...body, workspaceId: id(9) })).status).toBe(400);
  expect(
    (await run({ ...body, adjudication: { ...adjudication, attestation: {} } }))
      .status
  ).toBe(400);
  expect(adjudicate).not.toHaveBeenCalled();
});
it('denies changed actors and identity tuples', async () => {
  expect(
    (
      await run({
        ...body,
        adjudication: { ...adjudication, actorUserId: id(9) },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await run({
        ...body,
        adjudication: { ...adjudication, targetUserId: id(9) },
      })
    ).status
  ).toBe(409);
  expect(adjudicate).not.toHaveBeenCalled();
});
it('does not mutate when actor authorization changes before dispatch', async () => {
  authorize
    .mockResolvedValueOnce({ authorized: true, actorUserId: id(1) })
    .mockResolvedValue({ authorized: true, actorUserId: id(9) });
  expect((await run()).status).toBe(503);
  expect(adjudicate).not.toHaveBeenCalled();
});
it('fences lost mutation acknowledgements without replay and permits explicit readback', async () => {
  adjudicate.mockRejectedValue(new Error('lost'));
  expect((await run()).status).toBe(503);
  expect(adjudicate).toHaveBeenCalledTimes(1);
  expect((await run(undefined, {}, 'GET')).status).toBe(200);
  expect(adjudicate).toHaveBeenCalledTimes(1);
});
it('does not publish readiness when final authorization changes', async () => {
  authorize
    .mockResolvedValueOnce({ authorized: true, actorUserId: id(1) })
    .mockResolvedValueOnce({ authorized: true, actorUserId: id(1) })
    .mockResolvedValue({ authorized: false, status: 401 });
  expect((await run()).status).toBe(401);
});
it('does not publish readiness from an unrelated audit record', async () => {
  inspect
    .mockReset()
    .mockResolvedValueOnce(eligible)
    .mockResolvedValue({ ...ready, eventId: id(9) });
  expect((await run()).status).toBe(503);
});
