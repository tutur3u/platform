import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getWorkspaceDeletionBlock,
  isWorkspaceDeletionConfirmed,
  lookupActivePaidWorkspaceSubscription,
  type WorkspaceDeletionFacts,
} from '@tuturuuu/utils/workspace-deletion';

export type WorkspaceDeletionResult = {
  status: 200 | 400 | 403 | 404 | 409 | 500;
  body: { code: string; message: string };
};

export type WorkspaceDeletionDependencies = {
  supabase: TypedSupabaseClient;
  /**
   * Service-role client for the subscription head-count. The caller's client
   * cannot see `workspace_subscriptions` without `manage_subscription`.
   */
  subscriptionClient: () => Promise<TypedSupabaseClient>;
  getPermissions: () => Promise<WorkspaceDeletionFacts['permissions']>;
  isDeletionPrevented: () => Promise<boolean>;
  audit: (event: {
    action: 'workspace.delete';
    actorId: string;
    workspaceId: string;
    outcome: 'deleted' | 'denied' | 'failed';
    reason?: string;
  }) => void;
};

const DENIED: WorkspaceDeletionResult = {
  status: 403,
  body: { code: 'forbidden', message: 'This workspace cannot be deleted.' },
};

/**
 * Deletes a workspace when every server-side rule passes. The caller supplies
 * the parsed request body; the typed confirmation must name the workspace.
 */
export async function deleteWorkspaceForActor(
  input: { actorId: string; workspaceId: string; confirmation: unknown },
  deps: WorkspaceDeletionDependencies
): Promise<WorkspaceDeletionResult> {
  const { actorId, workspaceId } = input;
  const audit = (outcome: 'deleted' | 'denied' | 'failed', reason?: string) =>
    deps.audit({
      action: 'workspace.delete',
      actorId,
      workspaceId,
      outcome,
      reason,
    });

  const { data: workspace } = await deps.supabase
    .from('workspaces')
    .select('id, name, handle, personal')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!workspace) {
    return {
      status: 404,
      body: { code: 'not_found', message: 'Workspace not found.' },
    };
  }

  const [permissions, deletionPrevented, subscription] = await Promise.all([
    deps.getPermissions(),
    deps.isDeletionPrevented(),
    deps
      .subscriptionClient()
      .then((client) =>
        lookupActivePaidWorkspaceSubscription(client, workspaceId)
      ),
  ]);

  if (subscription.error) {
    console.error('Workspace deletion subscription lookup failed', {
      code: subscription.error.code,
    });
    audit('failed', 'subscription_lookup');
    return {
      status: 500,
      body: { code: 'failed', message: 'The workspace could not be deleted.' },
    };
  }

  const block = getWorkspaceDeletionBlock({
    workspaceId: workspace.id,
    personal: Boolean(workspace.personal),
    permissions,
    deletionPrevented,
    hasActivePaidSubscription: subscription.active,
  });

  if (block === 'subscription') {
    audit('denied', block);
    return {
      status: 409,
      body: {
        code: 'subscription_active',
        message: 'Cancel the workspace subscription before deleting it.',
      },
    };
  }
  if (block) {
    audit('denied', block);
    return DENIED;
  }

  if (!isWorkspaceDeletionConfirmed(input.confirmation, workspace)) {
    audit('denied', 'confirmation');
    return {
      status: 400,
      body: {
        code: 'confirmation_mismatch',
        message: 'Type the workspace name to confirm.',
      },
    };
  }

  const { error } = await deps.supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);

  if (error) {
    console.error('Workspace deletion failed', { code: error.code });
    audit('failed', 'delete');
    return {
      status: 500,
      body: { code: 'failed', message: 'The workspace could not be deleted.' },
    };
  }

  audit('deleted');
  return { status: 200, body: { code: 'deleted', message: 'success' } };
}
