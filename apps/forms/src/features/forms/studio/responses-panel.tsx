'use client';

import { RefreshCcw, Trash, User } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useClearFormResponsesMutation } from '../hooks';
import type {
  FormResponseRecord,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from '../types';
import { DestructiveActionDialog } from './destructive-action-dialog';
import { MetricCard } from './responses-metric-card';
import { ResponsesPagination } from './responses-pagination';
import { QuestionAnalyticsCard } from './responses-question-analytics-card';
import {
  type GroupedResponder,
  ResponderGroup,
} from './responses-responder-group';

export function ResponsesPanel({
  wsId,
  formId,
  responses,
  total,
  summary,
  page,
  pageSize,
  onPageChange,
  questionAnalytics = [],
  onRefresh,
  isRefreshing = false,
}: {
  wsId: string;
  formId: string;
  responses: FormResponseRecord[];
  total: number;
  summary: FormResponseSummary;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  questionAnalytics?: FormResponsesQuestionAnalytics[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [allExpanded, setAllExpanded] = useState(false);
  const [showAllQuestionAnalytics, setShowAllQuestionAnalytics] =
    useState(false);
  const clearResponsesMutation = useClearFormResponsesMutation({
    wsId,
    formId,
  });
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * pageSize, total);
  const showPagination = total > 0;

  const grouped = useMemo<GroupedResponder[]>(() => {
    const map = new Map<string, FormResponseRecord[]>();
    for (const response of responses) {
      const key =
        response.respondentEmail || response.respondentUserId || response.id;
      const group = map.get(key) ?? [];
      group.push(response);
      map.set(key, group);
    }

    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      label:
        group[0]?.respondentEmail ||
        group[0]?.respondentUserId ||
        t('responses.anonymous'),
      responses: group.sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      ),
    }));
  }, [responses, t]);

  const answerColumns = useMemo(
    () =>
      Array.from(
        new Set(responses.flatMap((response) => Object.keys(response.answers)))
      ),
    [responses]
  );
  const questionSummary = useMemo(() => {
    if (questionAnalytics.length === 0 || total === 0) {
      return {
        averageAnswerRate: 0,
        mostAnswered: undefined as FormResponsesQuestionAnalytics | undefined,
        leastAnswered: undefined as FormResponsesQuestionAnalytics | undefined,
      };
    }

    const sortedByAnswers = [...questionAnalytics].sort(
      (a, b) => b.totalAnswers - a.totalAnswers
    );

    return {
      averageAnswerRate:
        questionAnalytics.reduce(
          (sum, item) => sum + item.totalAnswers / Math.max(total, 1),
          0
        ) / questionAnalytics.length,
      mostAnswered: sortedByAnswers[0],
      leastAnswered: sortedByAnswers.at(-1),
    };
  }, [questionAnalytics, total]);
  const prioritizedQuestionAnalytics = useMemo(
    () =>
      [...questionAnalytics].sort((left, right) => {
        const leftRate =
          total === 0 ? 0 : left.totalAnswers / Math.max(total, 1);
        const rightRate =
          total === 0 ? 0 : right.totalAnswers / Math.max(total, 1);

        if (leftRate !== rightRate) {
          return leftRate - rightRate;
        }

        return right.totalAnswers - left.totalAnswers;
      }),
    [questionAnalytics, total]
  );
  const visibleQuestionAnalytics = showAllQuestionAnalytics
    ? prioritizedQuestionAnalytics
    : prioritizedQuestionAnalytics.slice(0, 6);
  const hiddenQuestionAnalyticsCount = Math.max(
    prioritizedQuestionAnalytics.length - visibleQuestionAnalytics.length,
    0
  );

  if (responses.length === 0 && questionAnalytics.length === 0) {
    return (
      <Card className="border-border/60 bg-card/80 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <User className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-sm">{t('responses.title')}</p>
          <p className="max-w-sm text-muted-foreground text-sm">
            {t('responses.no_responses')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle>{t('responses.title')}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {t('responses.total_submissions', { count: total })}
            </p>
            <p className="max-w-2xl text-muted-foreground text-sm">
              {t('responses.description')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              onClick={onRefresh}
              className="rounded-xl"
            >
              <RefreshCcw
                className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')}
              />
              {tCommon('refresh')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAllExpanded(!allExpanded)}
              className="rounded-xl"
            >
              {allExpanded
                ? t('responses.collapse_all')
                : t('responses.expand_all')}
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <a
                href={`/api/v1/workspaces/${wsId}/forms/${formId}/responses/export`}
              >
                {t('responses.export_csv')}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <a
                href={`/api/v1/workspaces/${wsId}/forms/${formId}/responses/export?format=xlsx`}
              >
                {t('responses.export_excel')}
              </a>
            </Button>
            <DestructiveActionDialog
              actionLabel={
                clearResponsesMutation.isPending
                  ? tCommon('deleting')
                  : t('responses.clear_all')
              }
              cancelLabel={tCommon('cancel')}
              description={t('responses.clear_all_confirmation_description')}
              isPending={clearResponsesMutation.isPending}
              onConfirm={async () => {
                await clearResponsesMutation.mutateAsync();
                router.refresh();
              }}
              title={t('responses.clear_all_confirmation_title')}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-destructive hover:text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  {t('responses.clear_all')}
                </Button>
              }
            >
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
                {t('responses.clear_all_confirmation_meta', {
                  count: summary.totalSubmissions,
                })}
              </div>
            </DestructiveActionDialog>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard
            label={t('responses.total_label')}
            value={summary.totalSubmissions}
          />
          <MetricCard
            label={t('responses.responders_label')}
            value={summary.totalResponders}
          />
          <MetricCard
            label={t('responses.logged_in_label')}
            value={summary.authenticatedResponders}
          />
          <MetricCard
            label={t('responses.repeat_users_label')}
            value={summary.duplicateAuthenticatedResponders}
          />
        </CardContent>
      </Card>

      {showPagination ? (
        <ResponsesPagination
          currentPage={currentPage}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={total}
          isRefreshing={isRefreshing}
          onPageChange={onPageChange}
        />
      ) : null}

      {questionAnalytics.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-lg">
              {t('responses.per_question_insights')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('responses.question_coverage')}
            </p>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/75 p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {t('responses.lowest_coverage_first')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('responses.lowest_coverage_first_description')}
                </p>
              </div>
              {hiddenQuestionAnalyticsCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setShowAllQuestionAnalytics(true)}
                >
                  {t('responses.show_more_questions', {
                    count: hiddenQuestionAnalyticsCount,
                  })}
                </Button>
              ) : prioritizedQuestionAnalytics.length > 6 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setShowAllQuestionAnalytics(false)}
                >
                  {t('responses.show_less_questions')}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label={t('responses.questions_tracked')}
              value={questionAnalytics.length}
            />
            <MetricCard
              label={t('responses.average_answer_rate')}
              value={Math.round(questionSummary.averageAnswerRate * 100)}
              suffix="%"
            />
            <MetricCard
              label={t('responses.most_answered')}
              value={questionSummary.mostAnswered?.totalAnswers ?? 0}
              helper={
                questionSummary.mostAnswered?.title ??
                t('responses.no_responses')
              }
            />
            <MetricCard
              label={t('responses.least_answered')}
              value={questionSummary.leastAnswered?.totalAnswers ?? 0}
              helper={
                questionSummary.leastAnswered?.title ??
                t('responses.no_responses')
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleQuestionAnalytics.map((qa, index) => (
              <QuestionAnalyticsCard
                key={qa.questionId}
                analytics={qa}
                total={total}
                rank={index + 1}
              />
            ))}
          </div>
          {prioritizedQuestionAnalytics.length > 6 &&
          showAllQuestionAnalytics ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setShowAllQuestionAnalytics(false)}
              >
                {t('responses.show_less_questions')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <Card className="border-border/60 bg-card/80 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">
              {t('responses.no_responses')}
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map((group, groupIndex) => (
          <ResponderGroup
            key={group.key}
            group={group}
            groupIndex={groupIndex}
            answerColumns={answerColumns}
            forceExpanded={allExpanded}
            defaultExpanded={grouped.length === 1}
          />
        ))
      )}

      {showPagination && grouped.length > 0 ? (
        <ResponsesPagination
          currentPage={currentPage}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={total}
          isRefreshing={isRefreshing}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
