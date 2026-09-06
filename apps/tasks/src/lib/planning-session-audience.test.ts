import {
  createAppSessionToken,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSessionAuthContext } from './api-auth';
import { withPlanningSessionAudience } from './planning-session-audience';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({ auth: {} })),
  createClient: vi.fn(() => {
    throw new Error('Calendar actor must not fall back to Supabase cookies');
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));
vi.mock('./infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));

describe('embedded planning session audiences', () => {
  beforeEach(() => {
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', 'planning-test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  function requestFor(targetApp: string, scopes = ['internal-app:session']) {
    const { token } = createAppSessionToken({
      userId: 'planning-user',
      targetApp,
      scopes,
    });
    return { headers: new Headers({ authorization: `Bearer ${token}` }) };
  }

  it.each(['tasks', 'calendar'])(
    'verifies the signed %s actor for Tasks-owned routes',
    (app) => {
      const result = verifyAppSessionRequest(
        requestFor(app),
        withPlanningSessionAudience({ targetApp: 'tasks' })
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.claims.sub).toBe('planning-user');
    }
  );

  it('does not accept unrelated app sessions', () => {
    expect(
      verifyAppSessionRequest(
        requestFor('mail'),
        withPlanningSessionAudience({ targetApp: ['platform', 'tasks'] })
      ).ok
    ).toBe(false);
  });

  it('preserves the route scope requirement', () => {
    expect(
      verifyAppSessionRequest(
        requestFor('calendar'),
        withPlanningSessionAudience({
          targetApp: 'tasks',
          requiredScope: 'tasks:write',
        })
      ).ok
    ).toBe(false);
  });

  it('leaves unrelated and already shared audiences unchanged', () => {
    for (const targetApp of [undefined, 'platform', ['calendar', 'tasks']]) {
      const options = { targetApp };
      expect(withPlanningSessionAudience(options)).toBe(options);
    }
  });

  it('does not mutate an explicit CLI and Tasks audience list', () => {
    const options = { targetApp: ['platform', 'tasks'] as const };
    expect(withPlanningSessionAudience(options).targetApp).toEqual([
      'platform',
      'tasks',
      'calendar',
    ]);
    expect(options.targetApp).toEqual(['platform', 'tasks']);
  });

  it('resolves the Calendar actor through the real Tasks session wrapper', async () => {
    const result = await resolveSessionAuthContext(
      {
        ...requestFor('calendar'),
        url: 'https://tasks.example.com/api/v1/workspaces/workspace-1/labels',
      },
      { allowAppSessionAuth: { targetApp: ['platform', 'tasks'] } }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe('planning-user');
      const { data } = await result.supabase.auth.getUser();
      expect(data.user?.id).toBe('planning-user');
    }
  });
});
