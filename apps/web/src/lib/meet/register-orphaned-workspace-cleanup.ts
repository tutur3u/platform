import { registerOrphanedWorkspaceCleanup } from '@tuturuuu/apis/members/route';

export function registerWebOrphanedWorkspaceCleanup() {
  registerOrphanedWorkspaceCleanup({
    async resume(wsId) {
      const { commitAttendanceErasure, readPendingAttendanceErasure } =
        await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
      const plan = await readPendingAttendanceErasure({
        op: 'workspace',
        wsId,
      });
      if (plan) await commitAttendanceErasure(plan);
    },
    async deleteWorkspace(wsId, remove) {
      const { withWorkspaceAttendanceErasure } =
        await import('@tuturuuu/meet-core/features/call/server/attendance-erasure');
      await withWorkspaceAttendanceErasure(wsId, remove);
    },
  });
}

registerWebOrphanedWorkspaceCleanup();
