/**
 * Maps canonical English list names (To Do, In Progress, …) to the same labels
 * used for status categories, so display strings stay consistent with board UI.
 */
export function translateTaskListNameForDisplay(
  name: string,
  labels: {
    toDo: string;
    inProgress: string;
    done: string;
    closed: string;
    documents: string;
  }
): string {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  const translations: Record<string, string> = {
    todo: labels.toDo,
    inprogress: labels.inProgress,
    done: labels.done,
    closed: labels.closed,
    documents: labels.documents,
  };
  return translations[normalized] ?? name;
}
