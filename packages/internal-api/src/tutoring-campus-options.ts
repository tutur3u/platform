/** Each campus label, like a class-to-campus mapping, is at most 80 characters. */
export const TUTORING_CAMPUS_LABEL_MAX_LENGTH = 80;
const MAX_CAMPUS_OPTIONS = 100;

/**
 * Validate the workspace campus list. Missing (legacy) lists read as empty;
 * labels are trimmed, blanks dropped and duplicates removed in order. Anything
 * that is not a list of strings, or a label over the length cap, is invalid.
 */
export function parseTutoringCampusOptions(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CAMPUS_OPTIONS) return null;
  const labels: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const label = raw.trim();
    if (label.length > TUTORING_CAMPUS_LABEL_MAX_LENGTH) return null;
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * The campus choices shared by the class mapping editor and announcement
 * place picker: the workspace list first, then any label still mapped to a
 * class but missing from the list, so legacy mappings are never dropped.
 */
export function getTutoringCampusChoices(policy: {
  campusByGroupId: Record<string, string>;
  campusOptions?: string[];
}) {
  const choices: string[] = [];
  for (const raw of [
    ...(policy.campusOptions ?? []),
    ...Object.values(policy.campusByGroupId),
  ]) {
    const label = raw.trim();
    if (label && !choices.includes(label)) choices.push(label);
  }
  return choices;
}
