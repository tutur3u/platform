import { registerOrphanedWorkspaceCleanup } from '@tuturuuu/apis/members/route';
import {
  deleteWorkspaceRowWithAttendance,
  resumeWorkspaceAttendanceErasure,
} from '@tuturuuu/meet-core/features/call/server/attendance-deletion-gate';

export function registerWebOrphanedWorkspaceCleanup() {
  registerOrphanedWorkspaceCleanup({
    resume: resumeWorkspaceAttendanceErasure,
    deleteWorkspace: deleteWorkspaceRowWithAttendance,
  });
}

registerWebOrphanedWorkspaceCleanup();
