import { z } from 'zod';

export type { SchedulingTaskTransport as CalendarSchedulingTask } from '@tuturuuu/tasks-ui/calendar/scheduling-task-transport';
export { schedulingTaskTransport } from '@tuturuuu/tasks-ui/calendar/scheduling-task-transport';
export { boardsTransportState } from '@tuturuuu/tasks-ui/tu-do/shared/boards-transport';
export function pageTaskEmbedding(value: unknown) {
  return z.json().optional().parse(value);
}
