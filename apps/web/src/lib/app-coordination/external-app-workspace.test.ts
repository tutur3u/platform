import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR,
  externalAppTokenAllowsWorkspace,
  isWorkspaceRouteScope,
  normalizeExternalAppWorkspaceId,
  rejectExternalAppRouteWorkspace,
  rejectExternalAppTokenWorkspace,
  requiresExternalAppWorkspaceBinding,
} from './external-app-workspace';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '77777777-7777-4777-8777-777777777777';
const personalWorkspaceId = '88888888-8888-4888-8888-888888888888';
const userId = '11111111-1111-4111-8111-111111111111';
const beforeExpiry = new Date('2026-11-25T23:58:59+07:00');
const atExpiry = new Date('2026-11-25T23:59:00+07:00');

function adminWithWorkspaces(
  rows: { handle?: string; id: string; personal?: boolean }[]
) {
  const from = vi.fn(() => {
    const filters: Record<string, unknown> = {};
    const query = {
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => {
        const row = rows.find((candidate) =>
          filters.personal === true
            ? candidate.personal === true
            : candidate.handle === filters.handle
        );
        return { data: row ? { id: row.id } : null, error: null };
      },
      select: () => query,
    };
    return query;
  });
  return { admin: { from } as never, from };
}

describe('externalAppTokenAllowsWorkspace', () => {
  it('admits the bound workspace and refuses every other one', () => {
    const claims = {
      scopes: ['workspace:drive:read'],
      target_app: 'fysh',
      workspace_id: workspaceId,
    };
    expect(externalAppTokenAllowsWorkspace(claims, workspaceId)).toBe(true);
    expect(
      externalAppTokenAllowsWorkspace(claims, workspaceId.toUpperCase())
    ).toBe(true);
    expect(externalAppTokenAllowsWorkspace(claims, otherWorkspaceId)).toBe(
      false
    );
  });

  it('refuses every bearer without a bound workspace', () => {
    for (const workspace_id of [undefined, '', '  ']) {
      expect(
        externalAppTokenAllowsWorkspace(
          {
            scopes: ['workspace:drive:read'],
            target_app: 'fysh',
            workspace_id,
          },
          workspaceId,
          beforeExpiry
        )
      ).toBe(false);
    }
  });

  it('admits an exempt app unbound bearer only before the RA expiry', () => {
    const unbound = {
      scopes: ['workspace:drive:read'],
      target_app: 'cybershield35',
    };
    expect(
      externalAppTokenAllowsWorkspace(unbound, workspaceId, beforeExpiry)
    ).toBe(true);
    expect(
      externalAppTokenAllowsWorkspace(unbound, workspaceId, atExpiry)
    ).toBe(false);
    expect(
      externalAppTokenAllowsWorkspace(
        { ...unbound, scopes: ['workspace:session'] },
        workspaceId,
        beforeExpiry
      )
    ).toBe(false);
    expect(
      externalAppTokenAllowsWorkspace(
        { ...unbound, workspace_id: otherWorkspaceId },
        workspaceId,
        beforeExpiry
      )
    ).toBe(false);
  });
});

describe('requiresExternalAppWorkspaceBinding', () => {
  it('binds workspace route and external-project scopes only', () => {
    for (const scope of [
      'workspace:session',
      'workspace:drive:read',
      'workspace:members:read',
      'workspace.members.email:read',
      'external-projects:read',
    ]) {
      expect(requiresExternalAppWorkspaceBinding([scope])).toBe(true);
      expect(isWorkspaceRouteScope(scope)).toBe(
        !scope.startsWith('external-projects:')
      );
    }
    expect(requiresExternalAppWorkspaceBinding(['users:profile:write'])).toBe(
      false
    );
    expect(requiresExternalAppWorkspaceBinding([])).toBe(false);
  });
});

describe('rejectExternalAppTokenWorkspace', () => {
  it('answers a mismatch with a stable 403', async () => {
    const response = rejectExternalAppTokenWorkspace(
      { scopes: [], target_app: 'fysh', workspace_id: workspaceId },
      otherWorkspaceId
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR,
    });
    expect(
      rejectExternalAppTokenWorkspace(
        { scopes: [], target_app: 'fysh', workspace_id: workspaceId },
        workspaceId
      )
    ).toBeNull();
  });
});

describe('normalizeExternalAppWorkspaceId', () => {
  it('resolves handle and personal aliases to the workspace UUID', async () => {
    const { admin } = adminWithWorkspaces([
      { handle: 'acme', id: workspaceId },
      { id: personalWorkspaceId, personal: true },
    ]);
    await expect(
      normalizeExternalAppWorkspaceId({ admin, userId, wsId: 'ACME' })
    ).resolves.toBe(workspaceId);
    await expect(
      normalizeExternalAppWorkspaceId({ admin, userId, wsId: 'personal' })
    ).resolves.toBe(personalWorkspaceId);
    await expect(
      normalizeExternalAppWorkspaceId({ admin, userId, wsId: 'missing' })
    ).resolves.toBe('missing');
  });

  it('throws when the user has no personal workspace', async () => {
    const { admin } = adminWithWorkspaces([]);
    await expect(
      normalizeExternalAppWorkspaceId({ admin, userId, wsId: 'personal' })
    ).rejects.toThrow('Personal workspace not found');
  });
});

describe('rejectExternalAppRouteWorkspace', () => {
  const bound = {
    scopes: ['users:profile:write'],
    sub: userId,
    workspace_id: workspaceId,
  };

  it('admits a route alias that resolves to the bound workspace', async () => {
    const { admin } = adminWithWorkspaces([
      { handle: 'acme', id: workspaceId },
      { id: workspaceId, personal: true },
    ]);
    for (const wsId of ['acme', 'personal', workspaceId]) {
      await expect(
        rejectExternalAppRouteWorkspace({
          admin,
          claims: bound,
          params: Promise.resolve({ wsId }),
        })
      ).resolves.toBeNull();
    }
  });

  it('refuses another workspace, an alias for one and an unresolved alias', async () => {
    const { admin } = adminWithWorkspaces([
      { handle: 'other', id: otherWorkspaceId },
    ]);
    for (const wsId of [otherWorkspaceId, 'other', 'missing', 'personal']) {
      const response = await rejectExternalAppRouteWorkspace({
        admin,
        claims: bound,
        params: { wsId },
      });
      expect(response?.status).toBe(403);
    }
  });

  it('skips routes without wsId and refuses unbound bearers unread', async () => {
    const { admin, from } = adminWithWorkspaces([]);
    await expect(
      rejectExternalAppRouteWorkspace({ admin, claims: bound, params: {} })
    ).resolves.toBeNull();
    const unbound = await rejectExternalAppRouteWorkspace({
      admin,
      claims: { sub: userId },
      params: { wsId: workspaceId },
    });
    expect(unbound?.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
