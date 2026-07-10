import { parseWorkspaceConfigIdList } from '@tuturuuu/internal-api/workspace-configs';
import type { TypedSupabaseClient } from '@tuturuuu/supabase';

const TABLE_NAME = 'workspace_default_included_user_groups';
const WORKSPACE_GROUP_VALIDATION_BATCH_SIZE = 100;

interface GroupIdsResult {
  data: string[];
  errorMessage?: string;
}

export async function listWorkspaceDefaultIncludedGroupIds(
  sbAdmin: TypedSupabaseClient,
  wsId: string
): Promise<GroupIdsResult> {
  const untypedAdmin = sbAdmin as any;

  const { data, error } = await untypedAdmin
    .from(TABLE_NAME)
    .select('group_id')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      data: [],
      errorMessage: error.message || 'Failed to fetch default included groups',
    };
  }

  return {
    data: ((data ?? []) as Array<{ group_id: string }>).map(
      (row) => row.group_id
    ),
  };
}

export async function replaceWorkspaceDefaultIncludedGroupIds(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  value: string | null | undefined
): Promise<GroupIdsResult> {
  const normalizedGroupIds = [...new Set(parseWorkspaceConfigIdList(value))];
  const untypedAdmin = sbAdmin as any;

  for (
    let index = 0;
    index < normalizedGroupIds.length;
    index += WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
  ) {
    const groupIdsBatch = normalizedGroupIds.slice(
      index,
      index + WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
    );
    const { data: workspaceGroups, error: workspaceGroupsError } = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', wsId)
      .in('id', groupIdsBatch);

    if (workspaceGroupsError) {
      return {
        data: [],
        errorMessage:
          workspaceGroupsError.message ||
          'Failed to validate default included groups',
      };
    }

    if ((workspaceGroups ?? []).length !== groupIdsBatch.length) {
      return {
        data: [],
        errorMessage: 'One or more selected user groups are invalid',
      };
    }
  }

  const { data: existingRows, error: existingRowsError } = await untypedAdmin
    .from(TABLE_NAME)
    .select('group_id')
    .eq('ws_id', wsId);

  if (existingRowsError) {
    return {
      data: [],
      errorMessage:
        existingRowsError.message ||
        'Failed to load existing default included groups',
    };
  }

  const existingGroupIds = new Set(
    ((existingRows ?? []) as Array<{ group_id: string }>).map(
      (row) => row.group_id
    )
  );
  const nextGroupIds = new Set(normalizedGroupIds);

  const groupIdsToDelete = [...existingGroupIds].filter(
    (groupId) => !nextGroupIds.has(groupId)
  );
  const groupIdsToInsert = normalizedGroupIds.filter(
    (groupId) => !existingGroupIds.has(groupId)
  );

  for (
    let index = 0;
    index < groupIdsToDelete.length;
    index += WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
  ) {
    const groupIdsToDeleteBatch = groupIdsToDelete.slice(
      index,
      index + WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
    );
    const { error: deleteError } = await untypedAdmin
      .from(TABLE_NAME)
      .delete()
      .eq('ws_id', wsId)
      .in('group_id', groupIdsToDeleteBatch);

    if (deleteError) {
      return {
        data: [],
        errorMessage:
          deleteError.message ||
          'Failed to remove default included user groups',
      };
    }
  }

  for (
    let index = 0;
    index < groupIdsToInsert.length;
    index += WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
  ) {
    const groupIdsToInsertBatch = groupIdsToInsert.slice(
      index,
      index + WORKSPACE_GROUP_VALIDATION_BATCH_SIZE
    );
    const { error: insertError } = await untypedAdmin.from(TABLE_NAME).upsert(
      groupIdsToInsertBatch.map((groupId) => ({
        ws_id: wsId,
        group_id: groupId,
      })),
      {
        onConflict: 'ws_id,group_id',
      }
    );

    if (insertError) {
      return {
        data: [],
        errorMessage:
          insertError.message || 'Failed to save default included user groups',
      };
    }
  }

  return {
    data: normalizedGroupIds,
  };
}

export async function appendWorkspaceDefaultIncludedGroupId(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  groupId: string
): Promise<{ errorMessage?: string }> {
  const untypedAdmin = sbAdmin as any;

  const { error } = await untypedAdmin.from(TABLE_NAME).upsert(
    {
      ws_id: wsId,
      group_id: groupId,
    },
    {
      onConflict: 'ws_id,group_id',
    }
  );

  if (error) {
    return {
      errorMessage:
        error.message || 'Failed to append default included user group',
    };
  }

  return {};
}
