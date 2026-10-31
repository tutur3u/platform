import { NextResponse } from 'next/server';
import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import { getTutoringData } from './data';

export const GET = createLegacyGetHandler(
  async (request: Request, context: { params: Promise<{ wsId: string }> }) => {
    const { wsId } = await context.params;
    const access = await resolveTutoringRouteAccess(request, wsId);
    if (!access.permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return getTutoringData(request, access);
  }
);
export const HEAD = createLegacyHeadHandler(GET);
