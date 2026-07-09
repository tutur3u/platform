import {
  getLearnerReports,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

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
      const reports = await getLearnerReports({
        db: await createAdminClient(),
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({ reports });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to list Tulearn reports:', error);
      return NextResponse.json(
        { message: 'Failed to load reports' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
