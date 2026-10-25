import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPermission } from './check-permission';
import {
  deniedSessionCases,
  denySession,
  permissionFixture,
} from './permission-test-fixture';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
let fixture: ReturnType<typeof permissionFixture>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T03:30:00.000Z'));
  fixture = permissionFixture();
  mocks.createAdminClient.mockResolvedValue(fixture.client);
});
afterEach(() => vi.useRealTimers());
const submit = (sessionId: string | null = 'session-1') =>
  checkPermission({
    canManageChallenge: fixture.canManageChallenge,
    problemId: 'problem-1',
    sessionId,
    userId: 'user-1',
  });

describe('Nova submission session permission', () => {
  it.each(deniedSessionCases)('denies %s', async (scenario) => {
    denySession(fixture, scenario);
    expect(await submit()).toMatchObject({
      canSubmit: false,
      remainingAttempts: 0,
    });
  });
  it('preserves sessionless submissions for a manager of the problem challenge', async () => {
    fixture.state.manager = true;
    fixture.state.managedChallenges = ['challenge-1'];
    expect(await submit(null)).toMatchObject({
      canSubmit: true,
      remainingAttempts: -1,
    });
  });
  it('denies sessionless submissions for a manager of a different challenge', async () => {
    fixture.state.manager = true;
    fixture.state.managedChallenges = ['challenge-2'];
    expect(await submit(null)).toMatchObject({
      canSubmit: false,
      remainingAttempts: 0,
    });
  });
  it('denies sessionless submissions for a disabled manager role', async () => {
    fixture.state.manager = true;
    fixture.state.managerEnabled = false;
    expect(await submit(null)).toMatchObject({
      canSubmit: false,
      remainingAttempts: 0,
    });
  });
  it('denies sessionless submissions for an unknown problem', async () => {
    fixture.state.managedChallenges = ['challenge-1'];
    expect(
      await checkPermission({
        canManageChallenge: fixture.canManageChallenge,
        problemId: 'problem-missing',
        sessionId: null,
        userId: 'user-1',
      })
    ).toMatchObject({ canSubmit: false });
  });
  it('validates supplied sessions for managers too', async () => {
    fixture.state.manager = true;
    fixture.state.managedChallenges = ['challenge-1'];
    fixture.state.session.user_id = 'user-2';
    expect(await submit()).toMatchObject({ canSubmit: false });
  });
  it('accepts an owned in-progress session for the problem challenge', async () => {
    expect(await submit()).toEqual({
      canSubmit: true,
      remainingAttempts: 3,
      message: null,
    });
  });
});
