import {
  getLearnerCourseDetail,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

type Params = {
  courseId: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      const course = await getLearnerCourseDetail({
        courseId,
        db: await createAdminClient(),
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      if (!course) {
        return NextResponse.json(
          { message: 'Course not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(course);
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to load Tulearn course:', error);
      return NextResponse.json(
        { message: 'Failed to load course' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
