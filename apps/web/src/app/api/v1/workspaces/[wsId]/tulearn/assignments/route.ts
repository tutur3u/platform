import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  awardTulearnXp,
  getAssignedCourseIds,
  getLearnerAssignments,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

type Params = {
  wsId: string;
};

const completionSchema = z.object({
  postId: z.string().uuid(),
  completed: z.boolean(),
});

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });
      const assignments = await getLearnerAssignments({
        db: await createAdminClient(),
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({ assignments });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to list Tulearn assignments:', error);
      return NextResponse.json(
        { message: 'Failed to load assignments' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const PATCH = withSessionAuth<Params>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });
      if (subject.readOnly) {
        return NextResponse.json(
          { message: 'Parents cannot update assignments' },
          { status: 403 }
        );
      }

      const parsed = completionSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid assignment payload' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient();
      const courseIds = await getAssignedCourseIds({
        db: sbAdmin,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      const { data: post, error: postError } = await sbAdmin
        .from('user_group_posts')
        .select('id, group_id')
        .eq('id', parsed.data.postId)
        .in('group_id', courseIds)
        .maybeSingle();

      if (postError) throw postError;
      if (!post) {
        return NextResponse.json(
          { message: 'Assignment not found' },
          { status: 404 }
        );
      }

      const { error: updateError } = await sbAdmin
        .from('user_group_post_checks')
        .upsert(
          {
            post_id: parsed.data.postId,
            user_id: subject.studentWorkspaceUserId,
            is_completed: parsed.data.completed,
          },
          { onConflict: 'user_id,post_id' }
        );

      if (updateError) throw updateError;

      const xpResult = parsed.data.completed
        ? await awardTulearnXp({
            db: sbAdmin,
            idempotencyKey: `assignment:${parsed.data.postId}`,
            metadata: { courseId: post.group_id },
            sourceId: parsed.data.postId,
            sourceType: 'assignment',
            userId: subject.studentPlatformUserId,
            wsId: subject.wsId,
            xp: 15,
          })
        : { awarded: false, xp: 0 };

      const [assignment] = (
        await getLearnerAssignments({
          db: sbAdmin,
          studentWorkspaceUserId: subject.studentWorkspaceUserId,
          wsId: subject.wsId,
        })
      ).filter((candidate) => candidate.id === parsed.data.postId);

      return NextResponse.json({
        assignment,
        xpAwarded: xpResult.xp,
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to update Tulearn assignment:', error);
      return NextResponse.json(
        { message: 'Failed to update assignment' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
