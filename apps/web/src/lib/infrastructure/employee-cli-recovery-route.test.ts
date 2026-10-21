import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  mfa: vi.fn(),
  current: vi.fn(),
  infra: vi.fn(),
  connect: vi.fn(),
  journal: vi.fn(),
  claim: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(),
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaAppSessionAllowed: mock.mfa,
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: mock.infra,
  authorizeCurrentEmployeeActor: mock.current,
}));
vi.mock('./employee-rejection-boundary', async (original) => ({
  ...(await original<typeof import('./employee-rejection-boundary')>()),
  connectEmployeeRejection: mock.connect,
}));
vi.mock('./employee-creation-runtime', () => ({
  createEmployeeRuntimeJournal: mock.journal,
}));
vi.mock('./employee-request-origin', () => ({
  employeeRequestOrigin: (r: Request) => new URL(r.url).origin,
}));

import { POST } from '../../app/api/v1/infrastructure/internal-accounts/employees/operations/[operationId]/cli-recovery/route';
import { authorizeEmployeeCliRecovery } from './employee-cli-recovery-authorization';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = {
  status: 'retry_ready',
  operationId: id(2),
  actorUserId: id(1),
  targetUserId: id(3),
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
  expectedVersion: 3,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
};
const secret = 'synthetic-recovery-route-secret';
function run() {
  const token = createCliAppSession(
    { userId: id(1), email: 'admin@tuturuuu.com' },
    { secret }
  ).access.token;
  return POST(
    new Request('https://web.test/recovery', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
        'Idempotency-Key': id(2),
      },
      body: JSON.stringify({
        action: 'resume',
        expected: ready,
        temporaryPassword: 'Synthetic-Pass-123!',
      }),
    }),
    { params: Promise.resolve({ operationId: id(2) }) }
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  mock.mfa.mockResolvedValue(true);
  mock.current.mockResolvedValue({ authorized: true, actorUserId: id(1) });
  mock.connect.mockResolvedValue({
    inspect: async () => ready,
    adjudicate: vi.fn(),
  });
  mock.claim.mockResolvedValue({
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
  mock.journal.mockResolvedValue({
    available: async () => true,
    claimAndRun: mock.claim,
  });
});
afterEach(() => vi.unstubAllEnvs());
it('wires POST to the original signed request and real CLI authorizer for journal phases', async () => {
  const response = await run();
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    status: 'created',
    operationId: id(2),
    account: { id: id(3) },
  });
  expect(mock.journal).toHaveBeenCalledExactlyOnceWith(
    expect.any(Request),
    authorizeEmployeeCliRecovery
  );
  const [original, authorize] = mock.journal.mock.calls[0]!;
  expect(await authorize(original)).toEqual({
    authorized: true,
    actorUserId: id(1),
  });
  mock.mfa.mockResolvedValue(false);
  expect(await authorize(original)).toEqual({ authorized: false, status: 403 });
  expect(mock.claim).toHaveBeenCalledExactlyOnceWith({
    actorUserId: id(1),
    operationId: id(2),
    payload: {
      email: ready.email,
      displayName: ready.displayName,
      temporaryPassword: 'Synthetic-Pass-123!',
    },
  });
  expect(mock.infra).not.toHaveBeenCalled();
});
it('denies revoked CLI MFA before constructing any runtime journal', async () => {
  mock.mfa.mockResolvedValue(false);
  const response = await run();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'employee_recovery_denied' });
  expect(mock.connect).not.toHaveBeenCalled();
  expect(mock.journal).not.toHaveBeenCalled();
  expect(mock.claim).not.toHaveBeenCalled();
  expect(mock.infra).not.toHaveBeenCalled();
});
