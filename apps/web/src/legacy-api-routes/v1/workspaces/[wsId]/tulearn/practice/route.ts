import {
  awardTulearnXp,
  getAssignedCourseIds,
  getLearnerState,
  getRecommendedPracticeItem,
  loseHeart,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

type Params = {
  wsId: string;
};

const practiceSchema = z.object({
  type: z.enum(['module', 'quiz', 'quiz_set', 'flashcard']),
  itemId: z.string().uuid(),
  correct: z.boolean().optional(),
});

const XP_BY_TYPE = {
  flashcard: 5,
  module: 25,
  quiz: 10,
  quiz_set: 20,
} as const;

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      const item = await getRecommendedPracticeItem({
        db: await createAdminClient(),
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({ item });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to load Tulearn practice:', error);
      return NextResponse.json(
        { message: 'Failed to load practice' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<Params>(
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
          { message: 'Parents can only review practice' },
          { status: 403 }
        );
      }

      const parsed = practiceSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid practice payload' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient();
      const courseIds = await getAssignedCourseIds({
        db: sbAdmin,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });
      if (!courseIds.length) {
        return NextResponse.json(
          { message: 'No available courses' },
          { status: 404 }
        );
      }

      const { type, itemId } = parsed.data;
      const correct = parsed.data.correct ?? true;

      const valid =
        type === 'module'
          ? await validateModulePractice(sbAdmin, itemId, courseIds)
          : await validateLinkedPracticeItem(sbAdmin, type, itemId, courseIds);

      if (!valid) {
        return NextResponse.json(
          { message: 'Practice item not found' },
          { status: 404 }
        );
      }

      const hearts = correct
        ? (
            await getLearnerState({
              db: sbAdmin,
              userId: subject.studentPlatformUserId,
              wsId: subject.wsId,
            })
          ).hearts
        : await loseHeart({
            db: sbAdmin,
            userId: subject.studentPlatformUserId,
            wsId: subject.wsId,
          });

      const xpResult = correct
        ? await awardTulearnXp({
            db: sbAdmin,
            idempotencyKey: `practice:${type}:${itemId}:${new Date().toISOString().slice(0, 10)}`,
            metadata: { type },
            sourceId: itemId,
            sourceType: type,
            userId: subject.studentPlatformUserId,
            wsId: subject.wsId,
            xp: XP_BY_TYPE[type],
          })
        : { awarded: false, xp: 0 };

      const state = await getLearnerState({
        db: sbAdmin,
        userId: subject.studentPlatformUserId,
        wsId: subject.wsId,
      });

      return NextResponse.json({
        correct,
        hearts,
        xpAwarded: xpResult.xp,
        state,
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to submit Tulearn practice:', error);
      return NextResponse.json(
        { message: 'Failed to submit practice' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

async function validateModulePractice(
  sbAdmin: TypedSupabaseClient,
  moduleId: string,
  courseIds: string[]
) {
  const { data, error } = await sbAdmin
    .from('workspace_course_modules')
    .select('id')
    .eq('id', moduleId)
    .in('group_id', courseIds)
    .eq('is_published', true)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function validateLinkedPracticeItem(
  sbAdmin: TypedSupabaseClient,
  type: 'flashcard' | 'quiz' | 'quiz_set',
  itemId: string,
  courseIds: string[]
) {
  const query =
    type === 'flashcard'
      ? sbAdmin
          .from('course_module_flashcards')
          .select(
            'module_id, workspace_course_modules!inner(group_id, is_published)'
          )
          .eq('flashcard_id', itemId)
      : type === 'quiz'
        ? sbAdmin
            .from('course_module_quizzes')
            .select(
              'module_id, workspace_course_modules!inner(group_id, is_published)'
            )
            .eq('quiz_id', itemId)
        : sbAdmin
            .from('course_module_quiz_sets')
            .select(
              'module_id, workspace_course_modules!inner(group_id, is_published)'
            )
            .eq('set_id', itemId);

  const { data, error } = await query
    .in('workspace_course_modules.group_id', courseIds)
    .eq('workspace_course_modules.is_published', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
