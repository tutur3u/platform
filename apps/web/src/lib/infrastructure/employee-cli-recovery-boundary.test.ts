import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(),
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));
vi.mock('./employee-request-origin', () => ({
  employeeRequestOrigin: (r: Request) => new URL(r.url).origin,
}));

import { makeEmployeeCliRecoveryBoundary } from './employee-cli-recovery-boundary';

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
const ready = {
  ...eligible,
  status: 'retry_ready',
  expectedVersion: 3,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
};
const resume = {
  action: 'resume',
  expected: ready,
  temporaryPassword: 'Synthetic-Pass-123!',
};
const adjudication = {
  ...eligible,
  status: undefined,
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
const authorize = vi.fn();
const inspect = vi.fn();
const adjudicate = vi.fn();
const claim = vi.fn();
const journal = vi.fn();
const available = vi.fn();
const connect = vi.fn();
function run(
  body: unknown = resume,
  headers: Record<string, string> = {},
  method = 'POST'
) {
  return makeEmployeeCliRecoveryBoundary({ authorize, connect, journal })(
    new Request('https://web.test/recovery', {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
        'Idempotency-Key': id(2),
        ...headers,
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }),
    id(2)
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ authorized: true, actorUserId: id(1) });
  inspect.mockResolvedValue(ready);
  connect.mockResolvedValue({ inspect, adjudicate });
  available.mockResolvedValue(true);
  journal.mockResolvedValue({ available, claimAndRun: claim });
  claim.mockResolvedValue({
    targetUserId: id(3),
    outcome: {
      status: 'created',
      operationId: id(2),
      account: {
        id: id(3),
        email: ready.email,
        displayName: ready.displayName,
      },
    },
  });
});
it('inspects the owned original operation without journal/provider access', async () => {
  const response = await run(undefined, {}, 'GET');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ready);
  expect(inspect).toHaveBeenCalledExactlyOnceWith(id(1), id(2));
  expect(journal).not.toHaveBeenCalled();
});
it('resumes only the exact version-3 original tuple with a validated transient password', async () => {
  expect((await run()).status).toBe(201);
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(claim).toHaveBeenCalledExactlyOnceWith({
    actorUserId: id(1),
    operationId: id(2),
    payload: {
      email: ready.email,
      displayName: ready.displayName,
      temporaryPassword: resume.temporaryPassword,
    },
  });
});
it.each([
  { status: 'fenced', operationId: id(2) },
  { ...ready, actorUserId: id(9) },
  { ...ready, operationId: id(9) },
  eligible,
  ...[
    'targetUserId',
    'email',
    'displayName',
    'originalLeaseId',
    'originalAttemptEventId',
    'eventId',
    'evidenceReferenceSha256',
  ].map((key) => ({
    ...ready,
    [key]:
      key === 'email'
        ? 'other@tuturuuu.com'
        : key === 'displayName'
          ? 'Other'
          : key === 'evidenceReferenceSha256'
            ? 'b'.repeat(64)
            : id(9),
  })),
])(
  'rejects missing/foreign/wrong tuple/version before claim',
  async (state) => {
    inspect.mockResolvedValue(state);
    expect((await run()).status).toBe(409);
    expect(claim).not.toHaveBeenCalled();
    expect(journal).not.toHaveBeenCalled();
    expect(adjudicate).not.toHaveBeenCalled();
  }
);
it('rejects unknown/malformed state without replay', async () => {
  inspect.mockResolvedValue({ ...ready, status: 'unknown' });
  expect((await run()).status).toBe(503);
  expect(claim).not.toHaveBeenCalled();
});
it('checks path/key, closed action, password, version and origin before claim', async () => {
  expect((await run(resume, { 'Idempotency-Key': id(9) })).status).toBe(400);
  expect((await run({ ...resume, temporaryPassword: 'weak' })).status).toBe(
    400
  );
  expect(
    (await run({ ...resume, expected: { ...ready, expectedVersion: 2 } }))
      .status
  ).toBe(400);
  expect((await run({ action: 'create' })).status).toBe(400);
  expect((await run(resume, { origin: 'https://foreign.test' })).status).toBe(
    403
  );
  expect(claim).not.toHaveBeenCalled();
});
it('never claims when current actor or immediately re-read state changes', async () => {
  authorize
    .mockResolvedValueOnce({ authorized: true, actorUserId: id(1) })
    .mockResolvedValue({ authorized: true, actorUserId: id(9) });
  expect((await run()).status).toBe(403);
  expect(claim).not.toHaveBeenCalled();
  authorize.mockResolvedValue({ authorized: true, actorUserId: id(1) });
  inspect
    .mockResolvedValueOnce(ready)
    .mockResolvedValue({ status: 'fenced', operationId: id(2) });
  expect((await run()).status).toBe(202);
  expect(claim).not.toHaveBeenCalled();
});
it('keeps adjudication attestation and lost-ack fence separate from resume', async () => {
  inspect.mockResolvedValue(eligible);
  adjudicate.mockRejectedValue(new Error('lost acknowledgement'));
  expect((await run({ action: 'adjudicate', adjudication })).status).toBe(503);
  expect(adjudicate).toHaveBeenCalledTimes(1);
  expect(journal).not.toHaveBeenCalled();
  expect(claim).not.toHaveBeenCalled();
  inspect.mockResolvedValue(ready);
  expect((await run(undefined, {}, 'GET')).status).toBe(200);
  expect(adjudicate).toHaveBeenCalledTimes(1);
  expect(claim).not.toHaveBeenCalled();
});
it('denies unauthenticated requests before inspection', async () => {
  authorize.mockResolvedValue({ authorized: false, status: 401 });
  expect((await run()).status).toBe(401);
  expect(connect).not.toHaveBeenCalled();
});

it('adjudicates once with the unchanged protocol and independently reads back its matching audit', async () => {
  inspect
    .mockResolvedValueOnce(eligible)
    .mockResolvedValueOnce(eligible)
    .mockResolvedValue(ready);
  adjudicate.mockResolvedValue({
    kind: 'adjudicated',
    operation: {
      actorUserId: id(1),
      operationId: id(2),
      targetUserId: id(3),
      email: ready.email,
      displayName: ready.displayName,
      phase: 'reserved',
      version: 3,
      leaseId: id(7),
      leaseExpiresAt: 0,
      revoked: false,
      lastReceipt: null,
    },
  });
  const response = await run({ action: 'adjudicate', adjudication });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ready);
  expect(adjudicate).toHaveBeenCalledTimes(1);
  expect(claim).not.toHaveBeenCalled();
});
it('does not expose a different target returned from a malformed journal', async () => {
  claim.mockResolvedValue({
    targetUserId: id(9),
    outcome: {
      status: 'created',
      operationId: id(2),
      account: {
        id: id(9),
        email: ready.email,
        displayName: ready.displayName,
      },
    },
  });
  expect((await run()).status).toBe(202);
});
