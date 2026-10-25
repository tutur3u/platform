import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deniedSessionCases,
  denySession,
  permissionFixture,
} from '../../../../../../../packages/utils/src/nova/submissions/permission-test-fixture';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: () => ({
    id: 'user-1',
    email: 'participant@example.test',
  }),
}));
let fixture: ReturnType<typeof permissionFixture>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T03:30:00.000Z'));
  fixture = permissionFixture();
  mocks.createAdminClient.mockResolvedValue(fixture.client);
});
afterEach(() => vi.useRealTimers());
const submit = () =>
  POST(
    new Request('https://nova.test/api/v1/submissions', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'test prompt',
        problemId: 'problem-1',
        sessionId: 'session-1',
      }),
    })
  );

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
});
