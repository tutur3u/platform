import { meetClassAttendanceEnabled } from '@tuturuuu/realtime/meet';

type WorkspaceRowDelete = () => Promise<{ error: unknown }>;

/**
 * Deletes one workspace row.
 * While the attendance switch is off, this does not import or call attendance erasure.
 */
export async function deleteWorkspaceRowWithAttendance(
  wsId: string,
  remove: WorkspaceRowDelete
): Promise<void> {
  if (!meetClassAttendanceEnabled()) {
    const removed = await remove();
    if (removed.error) throw removed.error;
    return;
  }
  const { withWorkspaceAttendanceErasure } =
    await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
  await withWorkspaceAttendanceErasure(wsId, remove);
}

/**
 * Finishes one workspace erasure plan.
 * While the attendance switch is off, this does not query pending plans.
 */
export async function resumeWorkspaceAttendanceErasure(
  wsId: string
): Promise<void> {
  if (!meetClassAttendanceEnabled()) return;
  const { commitAttendanceErasure, readPendingAttendanceErasure } =
    await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
  const plan = await readPendingAttendanceErasure({
    op: 'workspace',
    wsId,
  });
  if (plan) await commitAttendanceErasure(plan);
}
