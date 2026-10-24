import { connection } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { handleCalendarSettings } from '@/lib/calendar-settings-handler';

export const GET = withSessionAuth(
  async (request) => {
    await connection();
    return handleCalendarSettings(request);
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);

export const PATCH = withSessionAuth(
  (request) => handleCalendarSettings(request),
  {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
    rateLimitScope: 'user',
  }
);
