import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveWebHiveAccess } from '@/lib/hive-page-context';
import { CURRENT_USER_APP_SESSION_AUTH } from '../session-auth';

export const GET = withSessionAuth(
  async (_req, { user }) => {
    try {
      const sbAdmin = await createAdminClient({ noCookie: true });
      const accessResult = await resolveWebHiveAccess({
        userId: user.id,
        sbAdmin,
      });

      if ('error' in accessResult) {
        return NextResponse.json(
          { error: 'Failed to resolve Hive access' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        hasAccess: accessResult.hasAccess,
        isAdmin: accessResult.isAdmin,
        isMember: accessResult.isMember,
      });
    } catch (error) {
      console.error('Error resolving Hive access:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 300, swr: 60 },
  }
);
