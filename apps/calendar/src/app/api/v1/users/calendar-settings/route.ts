import { connection } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { handleCalendarSettings } from '@/lib/calendar-settings-handler';

export const GET = withSessionAuth(
  async (request, context) => {
    await connection();
    return handleCalendarSettings(request, undefined, context);
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);

export const PATCH = withSessionAuth(
  (request, context) => handleCalendarSettings(request, undefined, context),
  {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
    rateLimitScope: 'user',
  }
);
