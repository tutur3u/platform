import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getLearnerModuleDetail,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

type Params = {
  courseId: string;
  moduleId: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, moduleId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      const module = await getLearnerModuleDetail({
        courseId,
        db: await createAdminClient(),
        moduleId,
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      if (!module) {
        return NextResponse.json(
          { message: 'Module not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(module);
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to load Tulearn module:', error);
      return NextResponse.json(
        { message: 'Failed to load module' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
