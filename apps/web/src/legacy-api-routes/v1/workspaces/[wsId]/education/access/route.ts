import { checkEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  wsId: string;
}

export const GET = withSessionAuth(
  async (_request, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId } = await params;
    const access = await checkEducationWorkspaceAccess({ context, wsId });

    return NextResponse.json({
      enabled: access.ok,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
