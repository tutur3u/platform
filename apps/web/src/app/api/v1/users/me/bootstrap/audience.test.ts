/**
 * The bootstrap audience must stay a subset of every covered route's app-session
 * audience, read from the options each real route passes to withSessionAuth.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (_handler: unknown, options: unknown) => ({
    __options: options,
  }),
}));
vi.mock('@/lib/server-timing', () => ({
  timeServerPhase: (_phase: string, run: () => unknown) => run(),
  withServerTiming: (handler: unknown) => handler,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createDynamicAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  isWorkspaceUuidLiteral: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyHasSecrets: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  WorkspaceNotFoundError: class extends Error {},
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: vi.fn(),
  summarizeTaskBoardGuestShares: vi.fn(),
}));
vi.mock('@/lib/workspaces/workspace-deletion', () => ({
  deleteWorkspaceForActor: vi.fn(),
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  listPendingWorkspaceInvitations: vi.fn(),
}));
vi.mock('@tuturuuu/ui/lib/workspace-actions', () => ({
  fetchWorkspaceSummaries: vi.fn(),
}));
vi.mock('@/legacy-api-routes/v1/notifications/access', () => ({
  buildNotificationAccessFilter: vi.fn(),
  getNotificationAccessContext: vi.fn(),
}));
vi.mock('@/app/api/v1/users/me/hidden-workspaces/board-share-access', () => ({
  hasBoardShareWorkspaceAccess: vi.fn(),
}));

import { GET as getOnboarding } from '@/app/api/v1/user/onboarding-progress/route';
import { GET as getHidden } from '@/app/api/v1/users/me/hidden-workspaces/route';
import { GET as getProfile } from '@/app/api/v1/users/me/profile/route';
import { GET as getUnread } from '@/legacy-api-routes/v1/notifications/unread-count/route';
import { GET as getConfig } from '@/legacy-api-routes/v1/users/me/configs/[configId]/route';
import { GET as getWorkspaces } from '@/legacy-api-routes/v1/workspaces/route';
import { GET as getInvitations } from '@/legacy-api-routes/workspaces/invitations/route';
import { GET as getWorkspace } from '@/app/api/workspaces/[wsId]/route';
import {
  ALL_SATELLITE_APP_SESSION_TARGETS,
  getDefaultAppSessionVerificationOptions,
} from '@/lib/api-auth-audiences';
import { BOOTSTRAP_APP_SESSION_AUTH } from './auth';
import { bootstrapHandler } from './handler';

type Entry = {
  requiredScope?: string | false;
  targetApp?: string | readonly string[];
};
type Options = { allowAppSessionAuth?: true | Entry | readonly Entry[] };

const optionsOf = (handler: unknown) =>
  (handler as { __options: Options }).__options;

/** Targets accepted without any extra scope, for a request to `path`. */
function scopelessTargets(options: Options, path: string) {
  const configured = options.allowAppSessionAuth;
  const entries: readonly Entry[] =
    configured === true
      ? [getDefaultAppSessionVerificationOptions(path)]
      : Array.isArray(configured)
        ? configured
        : configured
          ? [configured as Entry]
          : [];
  return new Set(
    entries
      .filter((entry) => !entry.requiredScope && entry.targetApp)
      .flatMap((entry) => [entry.targetApp as string | string[]].flat())
  );
}

const covered: Array<[string, unknown, string]> = [
  ['profile', getProfile, '/api/v1/users/me/profile'],
  ['configs', getConfig, '/api/v1/users/me/configs/SORBET_THEME'],
  ['workspace', getWorkspace, '/api/workspaces/ws'],
  ['onboarding', getOnboarding, '/api/v1/user/onboarding-progress'],
  ['unreadCount', getUnread, '/api/v1/notifications/unread-count'],
  ['invitations', getInvitations, '/api/workspaces/invitations'],
  ['hiddenWorkspaces', getHidden, '/api/v1/users/me/hidden-workspaces'],
  ['workspaces', getWorkspaces, '/api/v1/workspaces'],
];

describe('bootstrap app-session audience', () => {
  const targets = [...BOOTSTRAP_APP_SESSION_AUTH.targetApp];

  it('is passed explicitly, with no scope-only grant', () => {
    expect(optionsOf(bootstrapHandler).allowAppSessionAuth).toBe(
      BOOTSTRAP_APP_SESSION_AUTH
    );
    expect(Object.keys(BOOTSTRAP_APP_SESSION_AUTH)).toEqual(['targetApp']);
  });

  it('excludes parley, cli and git and keeps the 24 shared targets', () => {
    expect(targets).toHaveLength(24);
    for (const excluded of ['parley', 'cli', 'git']) {
      expect(targets).not.toContain(excluded);
    }
    expect(targets).toContain('meet');
    for (const target of targets) {
      expect(ALL_SATELLITE_APP_SESSION_TARGETS as readonly string[]).toContain(
        target
      );
    }
  });

  it.each(covered)(
    'is a subset of the %s route audience',
    (_name, handler, path) => {
      const accepted = scopelessTargets(optionsOf(handler), path);
      expect(accepted.size).toBeGreaterThan(0);
      for (const target of targets) {
        expect(accepted.has(target)).toBe(true);
      }
    }
  );
});
