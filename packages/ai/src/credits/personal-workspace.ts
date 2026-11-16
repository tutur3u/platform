import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';

export class PersonalCreditWorkspaceError extends Error {
  constructor(
    public readonly code:
      | 'PERSONAL_WORKSPACE_NOT_FOUND'
      | 'PERSONAL_WORKSPACE_UNAVAILABLE'
      | 'INVALID_ACTOR',
    public readonly status: 401 | 403 | 503
  ) {
    super(code);
  }
}

const personalWorkspaceSchema = z.object({
  id: z.uuid(),
  creator_id: z.uuid(),
  personal: z.literal(true),
  workspace_members: z.array(z.object({ user_id: z.uuid() })),
});

export async function requirePersonalCreditWorkspace(
  userId: string,
  lookup: (actorId: string) => Promise<unknown>
): Promise<string> {
  if (!z.uuid().safeParse(userId).success)
    throw new PersonalCreditWorkspaceError('INVALID_ACTOR', 401);
  let workspace: unknown;
  try {
    workspace = await lookup(userId);
  } catch {
    throw new PersonalCreditWorkspaceError(
      'PERSONAL_WORKSPACE_UNAVAILABLE',
      503
    );
  }
  if (!workspace)
    throw new PersonalCreditWorkspaceError('PERSONAL_WORKSPACE_NOT_FOUND', 403);
  const parsed = personalWorkspaceSchema.safeParse(workspace);
  if (!parsed.success)
    throw new PersonalCreditWorkspaceError(
      'PERSONAL_WORKSPACE_UNAVAILABLE',
      503
    );
  if (
    parsed.data.creator_id !== userId ||
    !parsed.data.workspace_members.some((member) => member.user_id === userId)
  )
    throw new PersonalCreditWorkspaceError('PERSONAL_WORKSPACE_NOT_FOUND', 403);
  return parsed.data.id;
}

/** Resolve only the authenticated actor's personal pool; callers cannot select billing identity. */
export function resolvePersonalCreditWorkspaceId(
  client: TypedSupabaseClient,
  userId: string
) {
  return requirePersonalCreditWorkspace(userId, async (actorId) => {
    const { data, error } = await client
      .from('workspaces')
      .select('id, creator_id, personal, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('creator_id', actorId)
      .eq('workspace_members.user_id', actorId)
      .maybeSingle();
    if (error)
      throw new PersonalCreditWorkspaceError(
        'PERSONAL_WORKSPACE_UNAVAILABLE',
        503
      );
    return data;
  });
}
