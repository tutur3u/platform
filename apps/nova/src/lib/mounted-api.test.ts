import { afterEach, describe, expect, it } from 'vitest';
import { appApiPath } from './mounted-api';

const baseGlobal = globalThis as { __tuturuuuAppBase?: string };

afterEach(() => {
  delete baseGlobal.__tuturuuuAppBase;
});

describe('nova mounted API paths', () => {
  it('prefixes challenge, problem, session, team and whitelist routes under /nova', () => {
    baseGlobal.__tuturuuuAppBase = '/nova';
    expect(appApiPath('/api/v1/challenges/challenge-1')).toBe(
      '/nova/api/v1/challenges/challenge-1'
    );
    expect(appApiPath('/api/v1/problems/problem-1')).toBe(
      '/nova/api/v1/problems/problem-1'
    );
    expect(appApiPath('/api/v1/sessions/session-1')).toBe(
      '/nova/api/v1/sessions/session-1'
    );
    expect(appApiPath('/api/v1/nova/teams/team-1/members')).toBe(
      '/nova/api/v1/nova/teams/team-1/members'
    );
    expect(
      appApiPath('/api/v1/infrastructure/whitelist/user@example.com')
    ).toBe('/nova/api/v1/infrastructure/whitelist/user@example.com');
  });

  it('leaves Web profile, email, invites and the current team at the root', () => {
    baseGlobal.__tuturuuuAppBase = '/nova';
    expect(appApiPath('/api/v1/users/me/profile')).toBe(
      '/api/v1/users/me/profile'
    );
    expect(appApiPath('/api/v1/users/me/email')).toBe('/api/v1/users/me/email');
    expect(appApiPath('/api/workspaces/ws/accept-invite')).toBe(
      '/api/workspaces/ws/accept-invite'
    );
    expect(appApiPath('/api/workspaces/ws/decline-invite')).toBe(
      '/api/workspaces/ws/decline-invite'
    );
    expect(appApiPath('/api/v1/nova/me/team')).toBe('/api/v1/nova/me/team');
  });

  it('leaves ownerless prompt and re-evaluate routes at the root', () => {
    baseGlobal.__tuturuuuAppBase = '/nova';
    expect(appApiPath('/api/v1/problems/problem-1/prompt')).toBe(
      '/api/v1/problems/problem-1/prompt'
    );
    expect(appApiPath('/api/v1/submissions/submission-1/re-evaluate')).toBe(
      '/api/v1/submissions/submission-1/re-evaluate'
    );
  });
});
