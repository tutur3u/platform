import { ArrowLeft, CircleCheck, CircleX } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';

export const metadata: Metadata = {
  title: 'Attempt Detail',
  description: 'Review question-level answers and scores for a quiz attempt.',
};

interface Props {
  params: Promise<{
    attemptId: string;
    wsId: string;
  }>;
}

export default async function AttemptDetailsPage({ params }: Props) {
  const t = await getTranslations();
  const { attemptId, wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const sbAdmin = await createAdminClient();

  const { data: attempt, error: attemptError } = await sbAdmin
    .from('workspace_quiz_attempts')
    .select(
      'id, attempt_number, started_at, submitted_at, completed_at, duration_seconds, total_score, set_id, user_id, workspace_quiz_sets!inner(id, name, ws_id)'
    )
    .eq('id', attemptId)
    .eq('workspace_quiz_sets.ws_id', resolvedWsId)
    .maybeSingle();

  if (attemptError) throw attemptError;
  if (!attempt) notFound();

  const { data: learner } = await sbAdmin
    .from('user_private_details')
    .select('full_name, email')
    .eq('user_id', attempt.user_id)
    .maybeSingle();

  const { data: answers, error: answersError } = await sbAdmin
    .from('workspace_quiz_attempt_answers')
    .select('id, quiz_id, selected_option_id, is_correct, score_awarded')
    .eq('attempt_id', attempt.id);

  if (answersError) throw answersError;

  const quizIds = [...new Set((answers ?? []).map((answer) => answer.quiz_id))];
  const selectedOptionIds = [
    ...new Set((answers ?? []).map((answer) => answer.selected_option_id)),
  ];

  const [quizzesResponse, selectedOptionsResponse, allOptionsResponse] =
    await Promise.all([
      quizIds.length > 0
        ? sbAdmin
            .from('workspace_quizzes')
            .select('id, question')
            .in('id', quizIds)
        : Promise.resolve({ data: [], error: null }),
      selectedOptionIds.length > 0
        ? sbAdmin
            .from('quiz_options')
            .select('id, quiz_id, value, is_correct')
            .in('id', selectedOptionIds)
        : Promise.resolve({ data: [], error: null }),
      quizIds.length > 0
        ? sbAdmin
            .from('quiz_options')
            .select('id, quiz_id, value, is_correct')
            .in('quiz_id', quizIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (quizzesResponse.error) throw quizzesResponse.error;
  if (selectedOptionsResponse.error) throw selectedOptionsResponse.error;
  if (allOptionsResponse.error) throw allOptionsResponse.error;

  const quizById = new Map(
    (quizzesResponse.data ?? []).map((quiz) => [quiz.id, quiz])
  );
  const selectedOptionById = new Map(
    (selectedOptionsResponse.data ?? []).map((option) => [option.id, option])
  );
  const optionsByQuizId = new Map<
    string,
    { id: string; is_correct: boolean; value: string }[]
  >();
  for (const option of allOptionsResponse.data ?? []) {
    const options = optionsByQuizId.get(option.quiz_id) ?? [];
    options.push({
      id: option.id,
      is_correct: option.is_correct,
      value: option.value,
    });
    optionsByQuizId.set(option.quiz_id, options);
  }

  const joinedSet = Array.isArray(attempt.workspace_quiz_sets)
    ? attempt.workspace_quiz_sets[0]
    : attempt.workspace_quiz_sets;

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={`${t('workspace-education-tabs.attempt')} #${attempt.attempt_number}`}
        description={joinedSet?.name || t('common.unknown')}
        primaryAction={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/${routeWsId}/education/attempts`}>
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('common.score'),
            tone: 'green',
            value: attempt.total_score ?? '-',
          },
          {
            label: t('common.duration'),
            tone: 'orange',
            value: attempt.duration_seconds
              ? `${Math.round(attempt.duration_seconds / 60)}m`
              : '-',
          },
          {
            label: t('common.submitted_at'),
            tone: 'blue',
            value: new Date(attempt.submitted_at).toLocaleString(),
          },
        ]}
      />

      <EducationContentSurface>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">
              {t('approvals.labels.user')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">
              {learner?.full_name || t('common.unknown')}
            </div>
            <div className="text-foreground/65">
              {learner?.email || attempt.user_id}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 grid gap-3">
          {(answers ?? []).map((answer, index) => {
            const quiz = quizById.get(answer.quiz_id);
            const selectedOption = selectedOptionById.get(
              answer.selected_option_id
            );
            const options = optionsByQuizId.get(answer.quiz_id) ?? [];

            return (
              <Card key={answer.id} className="border-border/60">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">
                      {index + 1}. {quiz?.question || t('common.unknown')}
                    </CardTitle>
                    <Badge
                      variant={answer.is_correct ? 'default' : 'destructive'}
                    >
                      {answer.is_correct
                        ? t('common.correct')
                        : t('ai_chat.incorrect')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-foreground/70 text-sm">
                    {t('common.score')}: {answer.score_awarded}
                  </div>
                  <div className="grid gap-2">
                    {options.map((option) => {
                      const isSelected = option.id === selectedOption?.id;
                      return (
                        <div
                          key={option.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                            option.is_correct
                              ? 'border-dynamic-green/30 bg-dynamic-green/10'
                              : isSelected
                                ? 'border-dynamic-red/30 bg-dynamic-red/10'
                                : 'border-border/60 bg-background/70'
                          }`}
                        >
                          <span>{option.value}</span>
                          <span className="flex items-center gap-1">
                            {option.is_correct ? (
                              <CircleCheck className="h-4 w-4 text-dynamic-green" />
                            ) : null}
                            {isSelected && !option.is_correct ? (
                              <CircleX className="h-4 w-4 text-dynamic-red" />
                            ) : null}
                            {isSelected ? t('common.selected') : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </EducationContentSurface>
    </div>
  );
}
