import type { AttendanceErasurePlan } from '@tuturuuu/meet-core/features/call/server/attendance-erasure';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  isWorkspaceDeletionConfirmed,
  isWorkspaceDeletionOwner,
} from '@tuturuuu/utils/workspace-deletion';

const RESPONSES = {
  deleted: { status: 200, message: 'success' },
  confirmation_mismatch: {
    status: 400,
    message: 'Type the workspace name to confirm.',
  },
  forbidden: { status: 403, message: 'This workspace cannot be deleted.' },
  not_found: { status: 404, message: 'Workspace not found.' },
  subscription_active: {
    status: 409,
    message:
      'Resolve paid or unverified billing before deleting the workspace.',
  },
  failed: { status: 500, message: 'The workspace could not be deleted.' },
} as const;

type DeletionCode = keyof typeof RESPONSES;

async function attendanceCollectionEnabled() {
  try {
    const { meetClassAttendanceEnabled } =
      await import('@tuturuuu/realtime/meet');
    return meetClassAttendanceEnabled();
  } catch {
    return false;
  }
}

function erasureFailure(error: unknown) {
  console.error('Meet attendance erasure failed', {
    name: error instanceof Error ? error.name : 'unknown',
  });
}

export function workspaceDeletionResponse(code: DeletionCode) {
  const { status, message } = RESPONSES[code];
  return { status, body: { code, message } };
}

type WorkspaceDeletionActor = {
  actorId: string;
  workspaceId: string;
  supabase: TypedSupabaseClient;
};

export async function readWorkspaceDeletionOwner({
  actorId,
  workspaceId,
  supabase,
}: WorkspaceDeletionActor) {
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('id, name, personal, creator_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('Workspace deletion owner lookup failed', {
      code: error.code,
    });
    return { code: 'failed' } as const;
  }
  if (!workspace) return { code: 'not_found' } as const;
  if (!isWorkspaceDeletionOwner(workspace, actorId)) {
    return { code: 'forbidden' } as const;
  }
  return { code: 'allowed', workspace } as const;
}

export async function deleteWorkspaceForActor(
  actor: WorkspaceDeletionActor,
  confirmation: unknown
) {
  const { actorId, workspaceId } = actor;
  const audit = (code: DeletionCode) => {
    console.info('[audit] workspace.delete', {
      action: 'workspace.delete',
      actorId,
      workspaceId,
      outcome:
        code === 'deleted'
          ? 'deleted'
          : code === 'failed'
            ? 'failed'
            : 'denied',
      ...(code === 'deleted' ? {} : { reason: code }),
    });
    return workspaceDeletionResponse(code);
  };

  const authorization = await readWorkspaceDeletionOwner(actor);
  if (authorization.code !== 'allowed') return audit(authorization.code);
  if (
    typeof confirmation !== 'string' ||
    !isWorkspaceDeletionConfirmed(confirmation, authorization.workspace)
  ) {
    return audit('confirmation_mismatch');
  }

  let commitAttendanceErasure:
    | ((plan: AttendanceErasurePlan | null) => Promise<void>)
    | null = null;
  let attendancePlan: AttendanceErasurePlan | null = null;
  try {
    const erasure =
      await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
    // Read former room names before the delete cascades those rows away.
    attendancePlan =
      await erasure.prepareWorkspaceAttendanceErasure(workspaceId);
    commitAttendanceErasure = erasure.commitAttendanceErasure;
  } catch (error) {
    if (await attendanceCollectionEnabled()) throw error;
    erasureFailure(error);
  }

  const admin = await createAdminClient({ noCookie: true });
  const args = {
    p_ws_id: workspaceId,
    p_actor_id: actorId,
    p_confirmation: confirmation.trim(),
  };
  const { data, error } = await admin.rpc('delete_owned_workspace', args);
  if (error) {
    console.error('Workspace deletion failed', { code: error.code });
    return audit('failed');
  }

  const result: unknown = data;
  switch (result) {
    case 'deleted':
      try {
        if (commitAttendanceErasure)
          await commitAttendanceErasure(attendancePlan);
      } catch (error) {
        erasureFailure(error);
        if (!(await attendanceCollectionEnabled())) return audit('deleted');
        return audit('failed');
      }
      return audit('deleted');
    case 'forbidden':
    case 'not_found':
    case 'confirmation_mismatch':
    case 'subscription_active':
      return audit(result);
    default:
      return audit('failed');
  }
}
