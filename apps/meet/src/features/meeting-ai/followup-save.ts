import { localTimeToIso } from './followup-time';

export type FollowupSaveInput = {
  kind: 'task' | 'event';
  title: string;
  description: string;
  workspaceId: string;
  userId: string;
  listId: string;
  timezone: string;
  start: string;
  end: string;
  due: string;
  assignToMe: boolean;
  assigneeIds?: string[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  calendarId?: string;
  location?: string;
};
export function buildFollowupPayload(input: FollowupSaveInput) {
  if (!input.title.trim() || !input.workspaceId || !input.userId)
    throw new Error('invalid_followup');
  if (input.kind === 'task') {
    if (!input.listId || (input.assigneeIds === undefined && !input.assignToMe))
      throw new Error('invalid_followup');
    return {
      name: input.title.trim(),
      listId: input.listId,
      description: input.description,
      assignee_ids: [...new Set(input.assigneeIds ?? [input.userId])].sort(),
      priority: input.priority ?? 'normal',
      end_date: input.due ? localTimeToIso(input.due, input.timezone) : null,
    };
  }
  const start = localTimeToIso(input.start, input.timezone);
  const end = localTimeToIso(input.end, input.timezone);
  if (Date.parse(end) <= Date.parse(start)) throw new Error('invalid_time');
  return {
    title: input.title.trim(),
    description: input.description,
    calendarId: input.calendarId,
    location: input.location?.trim() || null,
    start_at: start,
    end_at: end,
  };
}
