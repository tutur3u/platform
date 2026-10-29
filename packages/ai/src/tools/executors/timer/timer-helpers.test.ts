import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../../mira-tools';
import { hasBypassApprovalPermission } from './timer-helpers';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const BYPASS = 'bypass_time_tracking_request_approval';

function makeContext(permissionWsId: string) {
  const roleMemberFilters = new Map<string, unknown>();
  const supabase = {
    from(table: string) {
      const filters = new Map<string, unknown>();
      const query = {
        eq: (column: string, value: unknown) => {
          filters.set(column, value);
          if (table === 'workspace_role_members') {
            roleMemberFilters.set(column, value);
          }
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({
          data: { creator_id: 'creator' },
          error: null,
        }),
        select: () => query,
      };
      Object.defineProperty(query, 'then', {
        value: (resolve: (value: unknown) => unknown) => {
          if (table === 'workspace_default_permissions') {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          // Emulate PostgREST embedded-resource filtering: a permission row
          // survives only when its ws_id matches the filter, if one is set.
          const scoped = filters.get(
            'workspace_roles.workspace_role_permissions.ws_id'
          );
          const permissionRows =
            scoped === undefined || scoped === permissionWsId
              ? [{ enabled: true, permission: BYPASS }]
              : [];
          return Promise.resolve({
            data: [
              {
                workspace_roles: {
                  workspace_role_permissions: permissionRows,
                  ws_id: WS_ID,
                },
              },
            ],
            error: null,
          }).then(resolve);
        },
      });
      return query;
    },
  };

  return {
    ctx: {
      supabase,
      userId: 'actor',
      wsId: WS_ID,
      workspaceContextId: WS_ID,
    } as unknown as MiraToolContext,
    roleMemberFilters,
  };
}

describe('hasBypassApprovalPermission', () => {
  it('ignores a bypass permission row that belongs to another workspace', async () => {
    const { ctx, roleMemberFilters } = makeContext('foreign-workspace');

    await expect(hasBypassApprovalPermission(ctx)).resolves.toBe(false);
    expect(
      roleMemberFilters.get('workspace_roles.workspace_role_permissions.ws_id')
    ).toBe(WS_ID);
  });

  it('accepts a bypass permission row from the requested workspace', async () => {
    const { ctx } = makeContext(WS_ID);

    await expect(hasBypassApprovalPermission(ctx)).resolves.toBe(true);
  });
});
