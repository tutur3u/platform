import {
  handleTaskRecurrence,
  MAX_RECURRENCE_REQUEST_BYTES,
} from '@tuturuuu/tasks-api/server/tasks/recurrence/route';
import { withSessionAuth } from '@/lib/api-auth';

export const POST = withSessionAuth<{ wsId: string }>(
  (request, { user, supabase }, { wsId }) =>
    handleTaskRecurrence(
      request,
      wsId,
      { user, supabase },
      process.env.TASK_RECURRENCE_RECEIPT_SECRET
    ),
  {
    allowAppSessionAuth: { targetApp: ['platform', 'tasks'] },
    maxPayloadSize: MAX_RECURRENCE_REQUEST_BYTES,
  }
);
