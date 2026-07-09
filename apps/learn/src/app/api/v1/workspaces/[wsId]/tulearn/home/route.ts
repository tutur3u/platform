import {
  getLearnerAssignments,
  getLearnerCourseSummaries,
  getLearnerMarks,
  getLearnerState,
  getRecommendedPracticeItem,
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

      const sbAdmin = await createAdminClient();
      const [state, courses, assignments, marks, recommendedPractice] =
        await Promise.all([
          getLearnerState({
            db: sbAdmin,
            userId: subject.studentPlatformUserId,
            wsId: subject.wsId,
          }),
          getLearnerCourseSummaries({
            db: sbAdmin,
            studentPlatformUserId: subject.studentPlatformUserId,
            studentWorkspaceUserId: subject.studentWorkspaceUserId,
            wsId: subject.wsId,
          }),
          getLearnerAssignments({
            db: sbAdmin,
            studentWorkspaceUserId: subject.studentWorkspaceUserId,
            wsId: subject.wsId,
          }),
          getLearnerMarks({
            db: sbAdmin,
            studentWorkspaceUserId: subject.studentWorkspaceUserId,
            wsId: subject.wsId,
          }),
          getRecommendedPracticeItem({
            db: sbAdmin,
            studentPlatformUserId: subject.studentPlatformUserId,
            studentWorkspaceUserId: subject.studentWorkspaceUserId,
            wsId: subject.wsId,
          }),
        ]);

      return NextResponse.json({
        role: subject.role,
        readOnly: subject.readOnly,
        student: {
          id: subject.studentWorkspaceUserId,
          name: subject.studentName,
        },
        state,
        courses,
        assignments,
        marks,
        recommendedPractice,
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to load Tulearn home:', error);
      return NextResponse.json(
        { message: 'Failed to load learner home' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
