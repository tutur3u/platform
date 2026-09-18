import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { forwardCalendarRequest } from '@/lib/mobile-calendar/gateway';
import { loadCalendarGatewaySecret } from '@/lib/mobile-calendar/secret';

async function handle(request: Request) {
  await connection();
  return forwardCalendarRequest(request, {
    verifyToken: async (token) => {
      const db = await createAdminClient({ noCookie: true });
      const { data, error } = await db.auth.getUser(token);
      if (error && (!error.status || error.status >= 500)) {
        throw new Error('Session verification unavailable');
      }
      return !error && Boolean(data.user);
    },
    loadSecret: loadCalendarGatewaySecret,
    fetch,
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
