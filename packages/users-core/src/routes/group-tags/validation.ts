import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_COLOR_LENGTH, MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';

export const MAX_GROUP_TAG_RELATIONSHIPS = 100;

const UniqueGroupIdsSchema = z
  .array(z.uuid())
  .max(MAX_GROUP_TAG_RELATIONSHIPS)
  .refine((groupIds) => new Set(groupIds).size === groupIds.length, {
    message: 'Group IDs must be unique',
  });

const GroupTagFieldsSchema = {
  color: z.string().trim().min(1).max(MAX_COLOR_LENGTH),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
};

export const CreateGroupTagSchema = z
  .object({
    ...GroupTagFieldsSchema,
    group_ids: UniqueGroupIdsSchema.optional().default([]),
  })
  .strict();

export const UpdateGroupTagSchema = z
  .object({
    ...GroupTagFieldsSchema,
    group_ids: UniqueGroupIdsSchema.optional(),
    id: z.uuid().optional(),
  })
  .strict();

export const AddGroupTagGroupsSchema = z
  .object({
    groupIds: UniqueGroupIdsSchema.default([]),
  })
  .strict();

export const GroupTagParamsSchema = z.object({
  tagId: z.uuid(),
  wsId: z.string().min(1),
});

export const GroupTagGroupParamsSchema = GroupTagParamsSchema.extend({
  groupId: z.uuid(),
});

export async function loadWorkspaceGroupTag(
  supabase: TypedSupabaseClient,
  wsId: string,
  tagId: string
) {
  return supabase
    .from('workspace_user_group_tags')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', tagId)
    .maybeSingle();
}

export async function loadWorkspaceUserGroups(
  supabase: TypedSupabaseClient,
  wsId: string,
  groupIds: string[]
) {
  if (groupIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', groupIds);
}
