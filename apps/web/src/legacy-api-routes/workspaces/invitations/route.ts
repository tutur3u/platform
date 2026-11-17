import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { outcomeResponse } from '@/lib/current-user/context';
import { readPendingInvitations } from '@/lib/current-user/invitations';

export const GET = withSessionAuth(
  async (_request, { user }) =>
    outcomeResponse(await readPendingInvitations({ user })),
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 0 },
    rateLimitKind: 'read',
  }
);
