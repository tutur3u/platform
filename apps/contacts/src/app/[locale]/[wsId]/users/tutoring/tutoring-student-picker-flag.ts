/**
 * Workspace flag `tutoring_student_picker_group_only` (registered in
 * config/feature-flags.json, default OFF). When ON, the tutoring student picker
 * lists only members of the selected group; with no group selected it still
 * lists every workspace user.
 *
 * Read from `workspace_configs`. Only the exact string `true` enables it, so a
 * missing row, any other value or a read failure keeps today's behaviour.
 * Kill switch: set the config to `false` or delete the row.
 */
export const TUTORING_STUDENT_PICKER_GROUP_ONLY_CONFIG_ID =
  'tutoring_student_picker_group_only';

export function isTutoringStudentPickerGroupOnly(
  value: string | null | undefined
): boolean {
  return value === 'true';
}
