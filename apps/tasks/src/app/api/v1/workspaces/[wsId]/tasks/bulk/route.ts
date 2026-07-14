import { handleTaskBulkRoutePOST } from '@tuturuuu/tasks-api/server/tasks/bulk/route';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string };

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskBulkRoutePOST(
      request,
      { params: Promise.resolve(params) },
      { supabase, user }
    ),
  {
    allowAppSessionAuth: {
      targetApp: ['platform', 'calendar', 'tasks'],
    },
  }
);
