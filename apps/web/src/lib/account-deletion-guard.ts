import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';

export const ACCOUNT_DELETION_LAST_MANAGER_CODE =
  'ACCOUNT_DELETION_LAST_MANAGER';
export const ACCOUNT_DELETION_LAST_MANAGER_MESSAGE =
  'Give another member member-management access, or delete the workspace first';

export type AccountDeletionBlockingWorkspace = {
  id: string;
  name: string;
};

/**
 * Lists workspaces where the actor is the last member manager while other
 * full members remain. Personal workspaces and workspaces without another
 * full member never appear. Throws when the lookup fails so callers fail
 * closed.
 */
export async function getAccountDeletionBlockingWorkspaces(
  sbAdmin: TypedSupabaseClient,
  actorId: string
): Promise<AccountDeletionBlockingWorkspace[]> {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('account_deletion_blocking_workspaces', { p_actor_id: actorId });

  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error('Unexpected account deletion guard result');
  }

  return data.map((row) => ({ id: row.ws_id, name: row.ws_name ?? '' }));
}

export function accountDeletionLastManagerResponse(
  workspaces: AccountDeletionBlockingWorkspace[]
) {
  return NextResponse.json(
    {
      code: ACCOUNT_DELETION_LAST_MANAGER_CODE,
      message: ACCOUNT_DELETION_LAST_MANAGER_MESSAGE,
      workspaces,
    },
    { status: 409 }
  );
}

/**
 * Returns a refusal response when the actor may not delete their own account,
 * or null when deletion may continue. Lookup failures refuse with 500.
 */
export async function refuseAccountDeletionForLastManager(
  sbAdmin: TypedSupabaseClient,
  actorId: string
): Promise<NextResponse | null> {
  let workspaces: AccountDeletionBlockingWorkspace[];
  try {
    workspaces = await getAccountDeletionBlockingWorkspaces(sbAdmin, actorId);
  } catch (error) {
    console.error('Account deletion manager guard failed:', error);
    return NextResponse.json(
      { message: 'Failed to verify workspace member managers' },
      { status: 500 }
    );
  }

  return workspaces.length > 0
    ? accountDeletionLastManagerResponse(workspaces)
    : null;
}
