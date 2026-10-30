import { NextResponse } from 'next/server';
import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { getTutoringData } from '../export/data';

export const GET = createLegacyGetHandler(
  async (request: Request, context: { params: Promise<{ wsId: string }> }) => {
    const url = new URL(request.url);
    if (!url.searchParams.get('fromDate') || !url.searchParams.get('toDate')) {
      return NextResponse.json(
        { message: 'Date range required' },
        { status: 400 }
      );
    }
    url.searchParams.set('mode', 'report');
    return getTutoringData(new Request(url, request), context);
  }
);
export const HEAD = createLegacyHeadHandler(GET);
