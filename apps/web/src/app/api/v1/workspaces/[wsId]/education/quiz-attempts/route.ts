import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/db';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  QuizGradeError,
  completedModuleIds,
  gradeLearnerAttempt,
} from '@/lib/education/grade-learner-attempt';
import { requireLearnerWorkspace } from '@/lib/education/learner-access';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';

const bodySchema = z.object({
  course_id: z.uuid().optional(),
  duration_seconds: z.number().int().min(0).max(86_400).optional(),
  answers: z
    .array(
      z.object({
        quiz_id: z.uuid(),
        selected_option_id: z.uuid(),
      })
    )
    .min(1)
    .max(100),
});

async function moduleQuizzes(
  sbAdmin: SupabaseClient<Database>,
  wsId: string,
  courseId: string
) {
  const course = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', courseId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (course.error) return { error: 'load' as const };
  if (!course.data) return { error: 'course' as const };

  const modules = await sbAdmin
    .from('workspace_course_modules')
    .select('id')
    .eq('group_id', courseId);
  if (modules.error) return { error: 'load' as const };
  const moduleIds = (modules.data ?? []).map((module) => module.id);
  if (moduleIds.length === 0) return { modules: [] };

  const links = await sbAdmin
    .from('course_module_quiz_sets')
    .select('module_id, set_id')
    .in('module_id', moduleIds);
  if (links.error) return { error: 'load' as const };
  const setIds = [...new Set((links.data ?? []).map((link) => link.set_id))];
  if (setIds.length === 0) {
    return {
      modules: moduleIds.map((id) => ({ id, quizIds: [] as string[] })),
    };
  }

  const memberships = await sbAdmin
    .from('quiz_set_quizzes')
    .select('set_id, quiz_id')
    .in('set_id', setIds);
  if (memberships.error) return { error: 'load' as const };

  const quizzesBySet = new Map<string, string[]>();
  for (const membership of memberships.data ?? []) {
    const quizzes = quizzesBySet.get(membership.set_id) ?? [];
    quizzes.push(membership.quiz_id);
    quizzesBySet.set(membership.set_id, quizzes);
  }
  const quizzesByModule = new Map<string, Set<string>>(
    moduleIds.map((id) => [id, new Set<string>()])
  );
  for (const link of links.data ?? []) {
    const quizzes = quizzesByModule.get(link.module_id);
    if (!quizzes) continue;
    for (const quizId of quizzesBySet.get(link.set_id) ?? []) {
      quizzes.add(quizId);
    }
  }
  return {
    modules: [...quizzesByModule].map(([id, quizIds]) => ({
      id,
      quizIds: [...quizIds],
    })),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  if (!learnerProgressRoutesEnabled()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const { wsId: wsIdParam } = await params;
  const access = await requireLearnerWorkspace(request, wsIdParam);
  if ('error' in access) return access.error;
  const { sbAdmin, userId, wsId, headers } = access;
  const learnerRows = sbAdmin.schema('private');

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid attempt' },
      { status: 400, headers }
    );
  }

  const quizIds = [
    ...new Set(parsed.data.answers.map((answer) => answer.quiz_id)),
  ];
  const [quizzesResult, optionsResult] = await Promise.all([
    sbAdmin
      .from('workspace_quizzes')
      .select('id, score')
      .eq('ws_id', wsId)
      .in('id', quizIds),
    sbAdmin
      .from('quiz_options')
      .select('id, quiz_id, is_correct, points')
      .in('quiz_id', quizIds),
  ]);
  if (quizzesResult.error || optionsResult.error) {
    return NextResponse.json(
      { message: 'Failed to grade attempt' },
      { status: 500, headers }
    );
  }

  let graded: ReturnType<typeof gradeLearnerAttempt>;
  try {
    graded = gradeLearnerAttempt({
      quizzes: quizzesResult.data ?? [],
      options: (optionsResult.data ?? []).map(
        (option: {
          id: string;
          quiz_id: string;
          is_correct: boolean;
          points: number | null;
        }) => ({
          id: option.id,
          quizId: option.quiz_id,
          isCorrect: option.is_correct,
          points: option.points,
        })
      ),
      answers: parsed.data.answers.map((answer) => ({
        quizId: answer.quiz_id,
        selectedOptionId: answer.selected_option_id,
      })),
    });
  } catch (error) {
    if (error instanceof QuizGradeError) {
      return NextResponse.json(
        { message: 'Invalid attempt' },
        { status: 400, headers }
      );
    }
    throw error;
  }

  const linked = parsed.data.course_id
    ? await moduleQuizzes(sbAdmin, wsId, parsed.data.course_id)
    : { modules: [] };
  if ('error' in linked) {
    return NextResponse.json(
      {
        message:
          linked.error === 'course'
            ? 'Course is outside this workspace'
            : 'Failed to grade attempt',
      },
      { status: linked.error === 'course' ? 400 : 500, headers }
    );
  }
  const completed = completedModuleIds({
    modules: linked.modules,
    graded: graded.answers,
  });

  const existing = await learnerRows
    .from('education_learner_quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('user_id', userId);
  if (existing.error) {
    return NextResponse.json(
      { message: 'Failed to save attempt' },
      { status: 500, headers }
    );
  }

  let saved: {
    id: string;
    attempt_number: number;
    submitted_at: string;
  } | null = null;
  for (let offset = 1; offset <= 2 && saved == null; offset += 1) {
    const inserted = await learnerRows
      .from('education_learner_quiz_attempts')
      .insert({
        ws_id: wsId,
        user_id: userId,
        course_id: parsed.data.course_id ?? null,
        attempt_number: (existing.count ?? 0) + offset,
        correct_count: graded.correctCount,
        question_count: graded.questionCount,
        total_score: graded.totalScore,
        duration_seconds: parsed.data.duration_seconds ?? null,
      })
      .select('id, attempt_number, submitted_at')
      .single();
    if (!inserted.error && inserted.data) {
      saved = inserted.data;
      break;
    }
    if (inserted.error?.code !== '23505') {
      return NextResponse.json(
        { message: 'Failed to save attempt' },
        { status: 500, headers }
      );
    }
  }
  if (!saved) {
    return NextResponse.json(
      { message: 'Failed to save attempt' },
      { status: 500, headers }
    );
  }
  const savedAttempt = saved;

  const answers = await learnerRows
    .from('education_learner_quiz_attempt_answers')
    .insert(
      graded.answers.map((answer) => ({
        attempt_id: savedAttempt.id,
        quiz_id: answer.quizId,
        selected_option_id: answer.selectedOptionId,
        is_correct: answer.isCorrect,
        score_awarded: answer.scoreAwarded,
      }))
    );
  if (answers.error) {
    await learnerRows
      .from('education_learner_quiz_attempts')
      .delete()
      .eq('id', saved.id);
    return NextResponse.json(
      { message: 'Failed to save attempt' },
      { status: 500, headers }
    );
  }

  if (completed.length > 0 && parsed.data.course_id) {
    const progress = await learnerRows
      .from('education_learner_module_progress')
      .upsert(
        completed.map((moduleId) => ({
          ws_id: wsId,
          course_id: parsed.data.course_id!,
          module_id: moduleId,
          user_id: userId,
        })),
        { onConflict: 'user_id,module_id', ignoreDuplicates: true }
      );
    if (progress.error) {
      return NextResponse.json(
        { message: 'Failed to save progress' },
        { status: 500, headers }
      );
    }
  }

  return NextResponse.json(
    {
      attempt: {
        id: saved.id,
        attempt_number: saved.attempt_number,
        correct_count: graded.correctCount,
        question_count: graded.questionCount,
        total_score: graded.totalScore,
        duration_seconds: parsed.data.duration_seconds ?? null,
        submitted_at: saved.submitted_at,
        completed_at: saved.submitted_at,
        course_id: parsed.data.course_id ?? null,
        user_id: userId,
        answers: graded.answers.map((answer) => ({
          quiz_id: answer.quizId,
          selected_option_id: answer.selectedOptionId,
          is_correct: answer.isCorrect,
          score_awarded: answer.scoreAwarded,
        })),
      },
      completed_module_ids: completed,
    },
    { status: 201, headers }
  );
}
