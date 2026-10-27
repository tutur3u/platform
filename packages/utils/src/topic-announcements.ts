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
  // Fail closed: every row with this name must be `true` (duplicates with
  // conflicting values keep the feature off).
  const rows = (secrets ?? []).filter(
    (secret) => secret.name === TOPIC_TEACHER_ASSIGNMENTS_SECRET
  );
  return rows.length > 0 && rows.every((secret) => secret.value === 'true');
}
