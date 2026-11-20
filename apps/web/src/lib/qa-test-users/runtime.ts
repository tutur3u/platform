import { deleteWorkspaceRowWithAttendance } from '@tuturuuu/meet-core/features/call/server/attendance-deletion-gate';
import { meetClassAttendanceEnabled } from '@tuturuuu/realtime/meet';
import {
  checkEnvVariables,
  getSupabaseCookieOptions,
} from '@tuturuuu/supabase/next/common';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { deleteWorkspaceWithAttendanceIntent } from '@/lib/meet/workspace-attendance-intent';
import type { QaDeletionDeps } from './deletion';
import type { QaProvisionDeps } from './provision';
import type { QaSessionDeps } from './session';
import { createQaStore } from './store';

type AuthPresence = 'absent' | 'present' | 'unknown';

/** Effectively permanent; the account is deleted right after. */
const QA_DELETION_BAN = '876000h';

async function authPresence(
  admin: TypedSupabaseClient,
  userId: string
): Promise<AuthPresence> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data.user) return 'present';
    if (error?.status === 404 || (!error && !data.user)) return 'absent';
  } catch {
    // Unknown: the caller keeps the deletion leased for a later re-check.
  }
  return 'unknown';
}

/**
 * Deletes the Auth account the way account deletion does: Meet attendance
 * erasure is recorded before the Auth delete and settled only once the
 * account is confirmed absent. The account is banned first, so its sessions
 * stop refreshing even when the delete itself stays unsettled.
 */
async function deleteAuthUser(
  admin: TypedSupabaseClient,
  userId: string
): Promise<'deleted' | 'present' | 'unknown'> {
  await admin.auth.admin
    .updateUserById(userId, { ban_duration: QA_DELETION_BAN })
    .catch(() => undefined);
  if (!meetClassAttendanceEnabled()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) return 'unknown';
    const presence = await authPresence(admin, userId);
    return presence === 'absent' ? 'deleted' : presence;
  }

  const erasure =
    await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
  const accountErasure =
    await import('@tuturuuu/meet-core/features/call/server/account-erasure');
  const plan = await erasure.prepareSubjectAttendanceErasure({ userId });
  await erasure.recordAttendanceErasure(plan);
  const { error } = await admin.auth.admin.deleteUser(userId);
  const outcome = accountErasure.classifyAccountDelete(
    error
      ? { status: typeof error.status === 'number' ? error.status : undefined }
      : null
  );
  const presence = await authPresence(admin, userId);
  const decision = accountErasure.reconcileAccountErasure(presence, outcome);
  if (decision === 'confirm') {
    await erasure.settleAttendanceErasure(plan);
    return 'deleted';
  }
  if (decision === 'cancel')
    await erasure.releaseAttendanceErasure({ plan, preexisting: false });
  return presence === 'present' ? 'present' : 'unknown';
}

/** Deletes a QA run workspace. Personal workspaces are never targeted. */
async function deleteRunWorkspace(admin: TypedSupabaseClient, wsId: string) {
  await deleteWorkspaceRowWithAttendance(wsId, async (plan) => {
    if (plan !== undefined)
      return deleteWorkspaceWithAttendanceIntent(admin, wsId, plan);
    return admin
      .from('workspaces')
      .delete()
      .eq('id', wsId)
      .eq('personal', false);
  });
}

export function createQaDeletionDeps(
  admin: TypedSupabaseClient
): QaDeletionDeps {
  return {
    store: createQaStore(admin),
    deleteWorkspace: (wsId) => deleteRunWorkspace(admin, wsId),
    deleteAuthUser: (userId) => deleteAuthUser(admin, userId),
  };
}

export function createQaProvisionDeps(
  admin: TypedSupabaseClient
): QaProvisionDeps {
  return { ...createQaDeletionDeps(admin), admin };
}

export function createQaSessionDeps(admin: TypedSupabaseClient): QaSessionDeps {
  const { url, key } = checkEnvVariables();
  return {
    store: createQaStore(admin),
    admin,
    supabaseUrl: url,
    publishableKey: key,
    cookieOptions: (origin) => getSupabaseCookieOptions(url, origin),
  };
}
