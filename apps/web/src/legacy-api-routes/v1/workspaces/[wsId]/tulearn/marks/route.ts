import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getLearnerMarks,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });
      const marks = await getLearnerMarks({
        db: await createAdminClient(),
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({ marks });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to list Tulearn marks:', error);
      return NextResponse.json(
        { message: 'Failed to load marks' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
