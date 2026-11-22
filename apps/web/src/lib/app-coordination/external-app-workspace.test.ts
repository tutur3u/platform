import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR,
  externalAppTokenAllowsWorkspace,
  normalizeExternalAppWorkspaceId,
  rejectExternalAppRouteWorkspace,
  rejectExternalAppTokenWorkspace,
} from './external-app-workspace';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '77777777-7777-4777-8777-777777777777';
const personalWorkspaceId = '88888888-8888-4888-8888-888888888888';
const userId = '11111111-1111-4111-8111-111111111111';

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

  it('admits an unbound bearer whose scopes bind no workspace', () => {
    expect(
      externalAppTokenAllowsWorkspace(
        { scopes: ['workspace:drive:read', 'workspace:members:read'] },
        workspaceId
      )
    ).toBe(true);
  });

  it('refuses an unbound bearer whose scopes always bind a workspace', () => {
    for (const scope of [
      'workspace:session',
      'external-projects:read',
      'external-projects:*',
    ]) {
      expect(
        externalAppTokenAllowsWorkspace({ scopes: [scope] }, workspaceId)
      ).toBe(false);
      expect(
        externalAppTokenAllowsWorkspace(
          { scopes: [scope], workspace_id: '' },
          workspaceId
        )
      ).toBe(false);
    }
  });
});

describe('rejectExternalAppTokenWorkspace', () => {
  it('answers a mismatch with a stable 403', async () => {
    const response = rejectExternalAppTokenWorkspace(
      { scopes: ['workspace:session'], workspace_id: workspaceId },
      otherWorkspaceId
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR,
    });
    expect(
      rejectExternalAppTokenWorkspace(
        { scopes: ['workspace:session'], workspace_id: workspaceId },
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

  it('skips the lookup for routes without wsId and unbound bearers', async () => {
    const { admin, from } = adminWithWorkspaces([]);
    await expect(
      rejectExternalAppRouteWorkspace({ admin, claims: bound, params: {} })
    ).resolves.toBeNull();
    await expect(
      rejectExternalAppRouteWorkspace({
        admin,
        claims: { scopes: ['users:profile:write'], sub: userId },
        params: { wsId: 'acme' },
      })
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();

    const unboundSession = await rejectExternalAppRouteWorkspace({
      admin,
      claims: { scopes: ['workspace:session'], sub: userId },
      params: { wsId: workspaceId },
    });
    expect(unboundSession?.status).toBe(403);
  });
});
