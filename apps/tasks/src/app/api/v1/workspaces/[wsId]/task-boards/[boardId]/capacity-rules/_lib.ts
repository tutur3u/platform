import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveTaskBoardAccess } from '@tuturuuu/tasks-api/server/board-access';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const capacityParamsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

export const capacityRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  limitValue: z.number().int().positive(),
  metric: z.enum(['task_count', 'estimation_points']).default('task_count'),
  enforcement: z.enum(['soft', 'hard']).default('soft'),
  countingMode: z.enum(['active', 'all_non_deleted']).default('active'),
  labelMatchMode: z.enum(['any', 'all']).default('any'),
  projectMatchMode: z.enum(['any', 'all']).default('any'),
  listIds: z.array(z.guid()).max(100).default([]),
  labelIds: z.array(z.guid()).max(100).default([]),
  projectIds: z.array(z.guid()).max(100).default([]),
});

export const capacityRulePatchSchema = capacityRuleSchema.partial();

export type CapacityManager = {
  boardId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
};

export async function requireCapacityAccess({
  boardId,
  rawWsId,
  supabase,
  user,
  write = false,
}: {
  boardId: string;
  rawWsId: string;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  write?: boolean;
}): Promise<CapacityManager | { error: NextResponse }> {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  if (write) {
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });
    if (!membership.ok)
      return {
        error: NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        ),
      };
    const permissions = await getPermissions({ wsId, user });
    if (!permissions?.containsPermission('manage_projects')) {
      return {
        error: NextResponse.json(
          { error: "You don't have permission to configure capacity rules" },
          { status: 403 }
        ),
      };
    }
  }
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const access = await resolveTaskBoardAccess({
    boardId,
    requiredPermission: 'view',
    sbAdmin,
    supabase,
    user,
    wsId,
  });
  if ('error' in access) return access;
  return { boardId: access.boardId, sbAdmin, wsId: access.wsId };
}

export async function loadCapacityRules(manager: CapacityManager) {
  return (manager.sbAdmin as any).rpc('get_task_capacity_rules', {
    p_board_id: manager.boardId,
  });
}

export async function validateSelectors(
  manager: CapacityManager,
  selectors: { listIds?: string[]; labelIds?: string[]; projectIds?: string[] }
) {
  const checks = await Promise.all([
    selectors.listIds?.length
      ? (manager.sbAdmin as any)
          .from('task_lists')
          .select('id')
          .eq('board_id', manager.boardId)
          .in('id', selectors.listIds)
      : Promise.resolve({ data: [] }),
    selectors.labelIds?.length
      ? (manager.sbAdmin as any)
          .from('workspace_task_labels')
          .select('id')
          .eq('ws_id', manager.wsId)
          .in('id', selectors.labelIds)
      : Promise.resolve({ data: [] }),
    selectors.projectIds?.length
      ? (manager.sbAdmin as any)
          .from('task_projects')
          .select('id')
          .eq('ws_id', manager.wsId)
          .in('id', selectors.projectIds)
      : Promise.resolve({ data: [] }),
  ]);
  const expected = [
    selectors.listIds?.length ?? 0,
    selectors.labelIds?.length ?? 0,
    selectors.projectIds?.length ?? 0,
  ];
  if (
    checks.some(
      (check, index) =>
        check.error || (check.data?.length ?? 0) !== expected[index]
    )
  ) {
    return NextResponse.json(
      { error: 'One or more selectors do not belong to this board workspace' },
      { status: 400 }
    );
  }
  return null;
}

export async function replaceSelectors(
  manager: CapacityManager,
  ruleId: string,
  body: {
    listIds?: string[];
    labelIds?: string[];
    projectIds?: string[];
  }
) {
  const dimensions = [
    ['task_capacity_rule_lists', 'list_id', body.listIds],
    ['task_capacity_rule_labels', 'label_id', body.labelIds],
    ['task_capacity_rule_projects', 'project_id', body.projectIds],
  ] as const;
  for (const [table, column, ids] of dimensions) {
    if (!ids) continue;
    const deletion = await (manager.sbAdmin as any)
      .from(table)
      .delete()
      .eq('rule_id', ruleId);
    if (deletion.error) throw deletion.error;
    if (ids.length) {
      const insertion = await (manager.sbAdmin as any)
        .from(table)
        .insert(ids.map((id) => ({ rule_id: ruleId, [column]: id })));
      if (insertion.error) throw insertion.error;
    }
  }
}

export function rulePayload(
  body: z.infer<typeof capacityRulePatchSchema>,
  userId: string
) {
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.enabled === undefined
      ? {}
      : {
          enabled: body.enabled,
          disabled_reason: body.enabled ? null : 'manually_disabled',
        }),
    ...(body.limitValue === undefined ? {} : { limit_value: body.limitValue }),
    ...(body.metric === undefined ? {} : { metric: body.metric }),
    ...(body.enforcement === undefined
      ? {}
      : { enforcement: body.enforcement }),
    ...(body.countingMode === undefined
      ? {}
      : { counting_mode: body.countingMode }),
    ...(body.labelMatchMode === undefined
      ? {}
      : { label_match_mode: body.labelMatchMode }),
    ...(body.projectMatchMode === undefined
      ? {}
      : { project_match_mode: body.projectMatchMode }),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}
