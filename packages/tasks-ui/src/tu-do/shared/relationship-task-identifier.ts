import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';

interface TaskIdentifierLike {
  display_number?: number | null;
  ticket_prefix?: string | null;
}

export function formatRelationshipTaskIdentifier(task: TaskIdentifierLike) {
  if (typeof task.display_number !== 'number') {
    return null;
  }

  return getTicketIdentifier(task.ticket_prefix, task.display_number);
}
