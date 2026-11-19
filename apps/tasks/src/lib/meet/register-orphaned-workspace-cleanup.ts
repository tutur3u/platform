import { registerOrphanedWorkspaceCleanup } from '@tuturuuu/apis/members/route';
import {
  deleteWorkspaceRowWithAttendance,
  resumeWorkspaceAttendanceErasure,
} from '@tuturuuu/meet-core/features/call/server/attendance-deletion-gate';

export function registerTasksOrphanedWorkspaceCleanup() {
  registerOrphanedWorkspaceCleanup({
    resume: resumeWorkspaceAttendanceErasure,
    deleteWorkspace: deleteWorkspaceRowWithAttendance,
  });
}

registerTasksOrphanedWorkspaceCleanup();
