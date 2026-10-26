export const TOPIC_ANNOUNCEMENTS_SECRET = 'ENABLE_TOPIC_ANNOUNCEMENTS';

/**
 * Turns on teacher-assigned topics (teacher access, assignment, deadlines,
 * schedule-to-draft import) for a workspace. Off unless explicitly `true`, so
 * workspaces already using topic announcements keep the supervisor flow.
 */
export const TOPIC_TEACHER_ASSIGNMENTS_SECRET =
  'ENABLE_TOPIC_TEACHER_ASSIGNMENTS';

export function isTopicTeacherAssignmentsEnabled(
  secrets: readonly { name?: string | null; value?: string | null }[] | null
) {
  return (
    secrets?.some(
      (secret) =>
        secret.name === TOPIC_TEACHER_ASSIGNMENTS_SECRET &&
        secret.value === 'true'
    ) ?? false
  );
}
