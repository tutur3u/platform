import {
  getLearnerCourseSummaries,
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

      const courses = await getLearnerCourseSummaries({
        db: await createAdminClient(),
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({ courses });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to list Tulearn courses:', error);
      return NextResponse.json(
        { message: 'Failed to load courses' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
