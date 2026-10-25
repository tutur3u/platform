import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deniedSessionCases,
  denySession,
  permissionFixture,
} from '../../../../../../../packages/utils/src/nova/submissions/permission-test-fixture';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getNovaPlatformRole: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: () => ({
    id: 'user-1',
    email: 'participant@example.test',
  }),
  getNovaPlatformRole: (...args: unknown[]) =>
    mocks.getNovaPlatformRole(...args),
}));
const assignedManagerRole = {
  allow_challenge_management: true,
  allow_manage_all_challenges: false,
  allow_role_management: false,
  enabled: true,
};
let fixture: ReturnType<typeof permissionFixture>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T03:30:00.000Z'));
  fixture = permissionFixture();
  mocks.createAdminClient.mockResolvedValue(fixture.client);
  mocks.getNovaPlatformRole.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());
const submit = (sessionId: string | null = 'session-1') =>
  POST(
    new Request('https://nova.test/api/v1/submissions', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'test prompt',
        problemId: 'problem-1',
        sessionId,
      }),
    })
  );

// An enabled manager assigned to `challengeId` only; the platform role row is
// what the pre-scoping implementation read.
function assignManager(challengeId: string, enabled = true) {
  fixture.state.manager = true;
  fixture.state.managerEnabled = enabled;
  fixture.state.managerEmail = {
    challenge_id: challengeId,
    email: 'participant@example.test',
  };
  mocks.getNovaPlatformRole.mockResolvedValue({
    ...assignedManagerRole,
    enabled,
  });
}

describe('Nova submission POST session authorization', () => {
  it.each(deniedSessionCases)(
    'rejects %s without writing',
    async (scenario) => {
      denySession(fixture, scenario);
      expect((await submit()).status).toBe(401);
      expect(fixture.state.inserts).toEqual([]);
    }
  );
  it('creates a submission for an owned active session and matching problem', async () => {
    const response = await submit();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 'submission-1',
      remainingAttempts: 3,
    });
    expect(fixture.state.inserts).toEqual([
      {
        prompt: 'test prompt',
        problem_id: 'problem-1',
        session_id: 'session-1',
        user_id: 'user-1',
      },
    ]);
  });
  it('rejects a sessionless submission by a manager of a different challenge', async () => {
    assignManager('challenge-2');
    expect((await submit(null)).status).toBe(401);
    expect(fixture.state.inserts).toEqual([]);
  });
  it('rejects a sessionless submission by a disabled manager role', async () => {
    assignManager('challenge-1', false);
    expect((await submit(null)).status).toBe(401);
    expect(fixture.state.inserts).toEqual([]);
  });
  it('allows a sessionless submission by a manager of the problem challenge', async () => {
    assignManager('challenge-1');
    expect((await submit(null)).status).toBe(201);
    expect(fixture.state.inserts).toEqual([
      expect.objectContaining({ problem_id: 'problem-1', session_id: null }),
    ]);
  });
});
