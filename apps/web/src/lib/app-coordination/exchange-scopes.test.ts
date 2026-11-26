import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowedAppTokenScopesWithWorkspaceSession as grant } from './exchange-scopes';

const WS = '22222222-2222-4222-8222-222222222222';
const EDUFEST = ['workspace:members:read', 'workspace:roles:read'];

describe('getAllowedAppTokenScopesWithWorkspaceSession', () => {
  afterEach(() => vi.useRealTimers());

  it('grants no workspace scope to an identity sign-in', () => {
    expect(
      grant({
        allowedScopes: EDUFEST,
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'edufest',
        requestedScopes: [],
      })
    ).toEqual([]);
  });

  it('keeps non-workspace scopes for an identity sign-in', () => {
    expect(
      grant({
        allowedScopes: [
          'users:profile:read',
          'workspace:drive:read',
          'external-projects:read',
        ],
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'some-app',
        requestedScopes: [],
      })
    ).toEqual(['users:profile:read']);
  });

  it('drops workspace:session when no workspace is named', () => {
    expect(
      grant({
        allowedScopes: ['workspace:session'],
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'ieeai-stats',
        requestedScopes: [],
      })
    ).toEqual([]);
  });

  it('keeps the full default grant, with workspace:session, when a workspace is named', () => {
    expect(
      grant({
        allowedScopes: EDUFEST,
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'edufest',
        requestedScopes: [],
        workspaceId: WS,
      })
    ).toEqual([...EDUFEST, 'workspace:session'].sort());
  });

  it('leaves explicit requests unchanged', () => {
    expect(
      grant({
        allowedScopes: EDUFEST,
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'edufest',
        requestedScopes: ['workspace:members:read'],
      })
    ).toEqual(['workspace:members:read']);
  });

  it('leaves an app exempt from strict binding unchanged', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T12:00:00+07:00'));
    expect(
      grant({
        allowedScopes: ['users:profile:read', 'workspace:members:read'],
        allowedWorkspaceIds: [WS],
        identitySignInAppId: 'cybershield35',
        requestedScopes: [],
      })
    ).toEqual(['users:profile:read', 'workspace:members:read']);
  });

  it('keeps the full grant for a refresh (no sign-in app id)', () => {
    expect(
      grant({
        allowedScopes: EDUFEST,
        allowedWorkspaceIds: [WS],
        requestedScopes: [],
      })
    ).toEqual(EDUFEST);
  });
});
