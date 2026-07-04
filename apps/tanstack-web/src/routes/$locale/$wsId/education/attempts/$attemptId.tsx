import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { ArrowLeft, CircleCheck, CircleX } from '@tuturuuu/icons';
import {
  getWorkspaceEducationAttemptDetail,
  type WorkspaceEducationAttemptAnswer,
  type WorkspaceEducationAttemptDetailResponse,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

const EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION = 'view_user_groups_reports';

type AttemptDetailRouteData = WorkspaceEducationAttemptDetailResponse & {
  workspaceId: string;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

const loadEducationAttemptDetail = createServerFn({ method: 'GET' })
  .validator((data: { attemptId: string; wsId: string }) => data)
  .handler(
    async ({ data }): Promise<WorkspaceEducationAttemptDetailResponse> =>
      getWorkspaceEducationAttemptDetail(
        data.wsId,
        data.attemptId,
        withForwardedInternalApiAuth(getRequestHeaders())
      )
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/attempts/$attemptId'
)({
  component: EducationAttemptDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review question-level answers and scores for a quiz attempt.',
      locale,
      title: 'Attempt Detail',
    });
  },
  loader: async ({ params }): Promise<AttemptDetailRouteData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/attempts/${params.attemptId}`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canViewAttempts = await hasWorkspacePermission({
      data: {
        permission: EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION,
        wsId: workspace.workspaceId,
      },
    });
    if (!canViewAttempts) {
      throw notFound();
    }

    const detail = await loadEducationAttemptDetail({
      data: {
        attemptId: params.attemptId,
        wsId: workspace.workspaceId,
      },
    });

    return {
      ...detail,
      workspaceId: workspace.workspaceId,
    };
  },
});

function EducationAttemptDetailRoutePage() {
  const data = Route.useLoaderData() as AttemptDetailRouteData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={`${t('workspace-education-tabs.attempt')} #${data.attempt.attempt_number}`}
        description={data.attempt.set_name || t('common.unknown')}
        primaryAction={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/${wsId}/education/attempts`}>
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
            value: data.attempt.total_score ?? '-',
          },
          {
            label: t('common.duration'),
            tone: 'orange',
            value: data.attempt.duration_seconds
              ? `${Math.round(data.attempt.duration_seconds / 60)}m`
              : '-',
          },
          {
            label: t('common.submitted_at'),
            tone: 'blue',
            value: formatDateTime(data.attempt.submitted_at),
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
              {data.learner?.full_name || t('common.unknown')}
            </div>
            <div className="text-foreground/65">
              {data.learner?.email || data.attempt.user_id}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 grid gap-3">
          {data.answers.map((answer, index) => (
            <AttemptAnswerCard
              answer={answer}
              index={index}
              key={answer.id}
              t={t}
            />
          ))}
        </div>
      </EducationContentSurface>
    </div>
  );
}

function AttemptAnswerCard({
  answer,
  index,
  t,
}: {
  answer: WorkspaceEducationAttemptAnswer;
  index: number;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">
            {index + 1}. {answer.question || t('common.unknown')}
          </CardTitle>
          <Badge variant={answer.is_correct ? 'default' : 'destructive'}>
            {answer.is_correct ? t('common.correct') : t('ai_chat.incorrect')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-foreground/70 text-sm">
          {t('common.score')}: {answer.score_awarded}
        </div>
        <div className="grid gap-2">
          {answer.options.map((option) => {
            const isSelected = option.id === answer.selected_option_id;

            return (
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  option.is_correct
                    ? 'border-dynamic-green/30 bg-dynamic-green/10'
                    : isSelected
                      ? 'border-dynamic-red/30 bg-dynamic-red/10'
                      : 'border-border/60 bg-background/70'
                }`}
                key={option.id}
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
}
