import {
  getMeetCallAccessForUser,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import { previewMeetingPlayground } from '@tuturuuu/meet-core/features/call/server/programming';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
export const GET = withSessionAuth<{
  meetingId: string;
  port: string;
  path?: string[];
}>(
  async (request, { user }, { meetingId, port, path = [] }) => {
    await connection();
    try {
      const access = await getMeetCallAccessForUser(
        meetingId,
        'Participant',
        user
      );
      const url = new URL(request.url);
      const nativePrefix = url.searchParams.get('__nativePrefix');
      url.searchParams.delete('__nativePrefix');
      if (
        nativePrefix &&
        !/^http:\/\/127\.0\.0\.1:\d{1,5}\/[a-f0-9]{64}\/preview\/\d{4,5}\/$/.test(
          nativePrefix
        )
      )
        return new NextResponse(null, { status: 400 });
      const prefix =
        nativePrefix ??
        `/api/v1/meetings/${encodeURIComponent(meetingId)}/collaboration/preview/${port}/`;
      const result = await previewMeetingPlayground(
        access,
        Number(port),
        `/${path.map(encodeURIComponent).join('/')}${url.search}`,
        prefix
      );
      return new NextResponse(result.body, {
        status: result.status,
        headers: result.headers,
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Preview unavailable' },
        {
          status: error instanceof MeetCallAccessError ? error.status : 503,
          headers: { 'Cache-Control': 'private, no-store' },
        }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: 'meet' } }
);
