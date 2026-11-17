import { z } from 'zod';
import {
  type CurrentUserReadContext,
  type SectionOutcome,
  timeDb,
} from './context';

export const HIDDEN_WORKSPACE_PREFERENCE_KEY = 'HIDDEN_WORKSPACE';
export const HIDDEN_WORKSPACE_GUEST_PREFIX = 'HIDDEN_WORKSPACE:';

/**
 * Body of `GET /api/v1/users/me/hidden-workspaces`. The `expectedActorId`
 * comparison belongs to the caller, before this read.
 */
export async function readHiddenWorkspaceIds(
  ctx: CurrentUserReadContext
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  const { data, error } = await timeDb(ctx, () =>
    supabase
      .from('user_workspace_configs')
      .select('ws_id')
      .eq('user_id', user.id)
      .eq('id', HIDDEN_WORKSPACE_PREFERENCE_KEY)
      .eq('value', 'true')
  );
  const { data: guestPreferences, error: guestError } = await timeDb(ctx, () =>
    supabase
      .from('user_configs')
      .select('id')
      .eq('user_id', user.id)
      .like('id', 'HIDDEN\\_WORKSPACE:%')
      .eq('value', 'true')
  );
  if (error || guestError) {
    return {
      body: { message: 'Unable to read Hidden workspaces' },
      status: 500,
    };
  }
  return {
    body: {
      hiddenWorkspaceIds: [
        ...new Set([
          ...(data ?? []).map((row: { ws_id: string }) => row.ws_id),
          ...(guestPreferences ?? [])
            .map((row: { id: string }) =>
              row.id.slice(HIDDEN_WORKSPACE_GUEST_PREFIX.length)
            )
            .filter((id: string) => z.uuid().safeParse(id).success),
        ]),
      ],
    },
    status: 200,
  };
}
