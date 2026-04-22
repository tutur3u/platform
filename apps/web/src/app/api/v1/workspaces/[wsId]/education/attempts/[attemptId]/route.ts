import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  wsId: string;
  attemptId: string;
}

export const GET = withSessionAuth(
  async (_request, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId, attemptId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: context.user.id,
      supabase: context.supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { message: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { data: attempt, error: attemptError } = await sbAdmin
      .from('workspace_quiz_attempts')
      .select(
        'id, attempt_number, started_at, submitted_at, completed_at, duration_seconds, total_score, set_id, user_id, workspace_quiz_sets!inner(id, name, ws_id)'
      )
      .eq('id', attemptId)
      .eq('workspace_quiz_sets.ws_id', normalizedWsId)
      .maybeSingle();

    if (attemptError) {
      return NextResponse.json(
        { message: 'Failed to fetch attempt details' },
        { status: 500 }
      );
    }

    if (!attempt) {
      return NextResponse.json(
        { message: 'Attempt not found' },
        { status: 404 }
      );
    }

    const { data: answers, error: answersError } = await sbAdmin
      .from('workspace_quiz_attempt_answers')
      .select('id, quiz_id, selected_option_id, is_correct, score_awarded')
      .eq('attempt_id', attemptId);

    if (answersError) {
      return NextResponse.json(
        { message: 'Failed to fetch attempt answers' },
        { status: 500 }
      );
    }

    const quizIds = [
      ...new Set((answers ?? []).map((answer) => answer.quiz_id)),
    ];
    const selectedOptionIds = [
      ...new Set((answers ?? []).map((answer) => answer.selected_option_id)),
    ];

    const [
      quizzesResponse,
      selectedOptionsResponse,
      allOptionsResponse,
      learnerResponse,
    ] = await Promise.all([
      quizIds.length
        ? sbAdmin
            .from('workspace_quizzes')
            .select('id, question')
            .in('id', quizIds)
        : Promise.resolve({ data: [], error: null }),
      selectedOptionIds.length
        ? sbAdmin
            .from('quiz_options')
            .select('id, quiz_id, value, is_correct, explanation')
            .in('id', selectedOptionIds)
        : Promise.resolve({ data: [], error: null }),
      quizIds.length
        ? sbAdmin
            .from('quiz_options')
            .select('id, quiz_id, value, is_correct, explanation')
            .in('quiz_id', quizIds)
        : Promise.resolve({ data: [], error: null }),
      sbAdmin
        .from('user_private_details')
        .select('user_id, full_name, email')
        .eq('user_id', attempt.user_id)
        .maybeSingle(),
    ]);

    if (
      quizzesResponse.error ||
      selectedOptionsResponse.error ||
      allOptionsResponse.error
    ) {
      return NextResponse.json(
        { message: 'Failed to fetch quiz metadata' },
        { status: 500 }
      );
    }

    if (learnerResponse.error) {
      return NextResponse.json(
        { message: 'Failed to fetch learner metadata' },
        { status: 500 }
      );
    }

    const quizById = new Map(
      (quizzesResponse.data ?? []).map((quiz) => [quiz.id, quiz])
    );
    const selectedOptionById = new Map(
      (selectedOptionsResponse.data ?? []).map((option) => [option.id, option])
    );
    const optionsByQuizId = new Map<
      string,
      {
        id: string;
        value: string;
        is_correct: boolean;
        explanation: string | null;
      }[]
    >();

    for (const option of allOptionsResponse.data ?? []) {
      const options = optionsByQuizId.get(option.quiz_id) ?? [];
      options.push({
        id: option.id,
        value: option.value,
        is_correct: option.is_correct,
        explanation: option.explanation,
      });
      optionsByQuizId.set(option.quiz_id, options);
    }

    const answerRows = (answers ?? []).map((answer) => {
      const selectedOption = selectedOptionById.get(answer.selected_option_id);
      const quiz = quizById.get(answer.quiz_id);

      return {
        id: answer.id,
        quiz_id: answer.quiz_id,
        question: quiz?.question ?? null,
        selected_option_id: answer.selected_option_id,
        selected_option_value: selectedOption?.value ?? null,
        selected_option_is_correct: selectedOption?.is_correct ?? null,
        is_correct: answer.is_correct,
        score_awarded: answer.score_awarded,
        options: optionsByQuizId.get(answer.quiz_id) ?? [],
      };
    });

    const joinedSet = Array.isArray(attempt.workspace_quiz_sets)
      ? attempt.workspace_quiz_sets[0]
      : attempt.workspace_quiz_sets;

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        attempt_number: attempt.attempt_number,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        completed_at: attempt.completed_at,
        duration_seconds: attempt.duration_seconds,
        total_score: attempt.total_score,
        set_id: attempt.set_id,
        set_name: joinedSet?.name ?? null,
        user_id: attempt.user_id,
      },
      learner: learnerResponse.data
        ? {
            user_id: learnerResponse.data.user_id,
            full_name: learnerResponse.data.full_name,
            email: learnerResponse.data.email,
          }
        : null,
      answers: answerRows,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
