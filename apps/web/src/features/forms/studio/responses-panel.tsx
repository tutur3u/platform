'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Trash,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useClearFormResponsesMutation } from '../hooks';
import type {
  FormResponseRecord,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from '../types';
import { ChartTooltipContent } from './chart-tooltip-content';
import { DestructiveActionDialog } from './destructive-action-dialog';

interface GroupedResponder {
  key: string;
  label: string;
  responses: FormResponseRecord[];
}

export function ResponsesPanel({
  wsId,
  formId,
  responses,
  total,
  summary,
  questionAnalytics = [],
  onRefresh,
  isRefreshing = false,
}: {
  wsId: string;
  formId: string;
  responses: FormResponseRecord[];
  total: number;
  summary: FormResponseSummary;
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
    </div>
  );
}

function QuestionAnalyticsCard({
  analytics,
  total,
  rank,
}: {
  analytics: FormResponsesQuestionAnalytics;
  total: number;
  rank: number;
}) {
  const t = useTranslations('forms');
  const answerRate =
    total === 0 ? 0 : Math.round((analytics.totalAnswers / total) * 100);
  const unmatchedAnswers = analytics.unmatchedAnswers ?? [];
  const textResponses = analytics.textResponses ?? [];
  const distribution = analytics.choices?.length
    ? analytics.choices.map((choice) => ({
        key: choice.value,
        label: choice.label,
        count: choice.count,
        percentage: choice.percentage,
      }))
    : analytics.scale?.length
      ? analytics.scale.map((item) => ({
          key: item.score,
          label:
            item.label !== item.score
              ? `${item.score} · ${item.label}`
              : item.score,
          count: item.count,
          percentage: item.percentage,
        }))
      : [];
  const donutColors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899'];
  const topDistribution = distribution.slice(0, 5);
  const hiddenChoicesCount = Math.max(
    distribution.length - topDistribution.length,
    0
  );
  const isAtRisk = answerRate < 50;

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 text-[11px]"
              >
                #{rank}
              </Badge>
              {isAtRisk ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-dynamic-orange/40 px-2 py-0.5 text-[11px] text-dynamic-orange"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t('responses.needs_attention')}
                </Badge>
              ) : null}
            </div>
            <CardTitle className="mt-2 truncate text-base">
              {analytics.title}
            </CardTitle>
          </div>
          <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
            {t('responses.answer_rate', { count: answerRate })}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('responses.question_type_label', {
            type: t(`question_type.${analytics.type}`),
          })}
          {' · '}
          {t('responses.answers_count', {
            count: analytics.totalAnswers,
            total,
          })}
          {analytics.meanScore != null
            ? ` · ${t('responses.average_score', { score: analytics.meanScore })}`
            : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {distribution.length > 0 ? (
          <>
            <div className="rounded-2xl border border-border/50 bg-background/45 p-2">
              <div className="mb-3 flex items-center justify-between gap-3 px-2">
                <p className="font-medium text-sm">
                  {t('responses.top_distribution')}
                </p>
                {hiddenChoicesCount > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {t('responses.remaining_choices', {
                      count: hiddenChoicesCount,
                    })}
                  </span>
                ) : null}
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topDistribution}
                    margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tick={{ fontSize: 11 }}
                      height={44}
                    />
                    <YAxis tickLine={false} axisLine={false} width={28} />
                    <Tooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            value ?? 0,
                            t('responses.total_label'),
                          ]}
                        />
                      }
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {topDistribution.map((item, index) => (
                        <Cell
                          key={item.key}
                          fill={donutColors[index % donutColors.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2.5">
              {topDistribution.map((item, index) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-border/50 bg-background/45 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            donutColors[index % donutColors.length],
                        }}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span className="shrink-0 font-medium">
                      {item.count} ({item.percentage}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : textResponses.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
            <p className="font-medium text-sm">
              {t('responses.top_written_responses')}
            </p>
            <div className="space-y-2">
              {textResponses.slice(0, 3).map((item) => (
                <div
                  key={item.value}
                  className="rounded-xl border border-border/50 bg-background/60 px-3.5 py-3"
                >
                  <p className="line-clamp-3 text-sm">{item.value}</p>
                  <p className="mt-2 text-muted-foreground text-xs">
                    {t('responses.written_response_count', {
                      count: item.count,
                      percentage: item.percentage,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-muted-foreground text-sm">
            {t('responses.no_answer_distribution')}
          </div>
        )}
        {unmatchedAnswers.length > 0 ? (
          <div className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/8 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
              <div className="min-w-0 space-y-2">
                <p className="font-medium text-dynamic-orange text-sm">
                  {t('responses.unmatched_answers_title')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('responses.unmatched_answers_description', {
                    count: unmatchedAnswers.reduce(
                      (sum, item) => sum + item.count,
                      0
                    ),
                  })}
                </p>
                <div className="space-y-1.5">
                  {unmatchedAnswers.slice(0, 3).map((item) => (
                    <div
                      key={item.value}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="truncate font-medium">{item.value}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {t('responses.unmatched_answer_count', {
                          count: item.count,
                        })}
                      </span>
                    </div>
                  ))}
                  {unmatchedAnswers.length > 3 ? (
                    <p className="text-muted-foreground text-xs">
                      {t('responses.remaining_choices', {
                        count: unmatchedAnswers.length - 3,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  helper,
}: {
  label: string;
  value: number;
  suffix?: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
        {label}
      </p>
      <p className="mt-1 font-semibold text-2xl">
        {value}
        {suffix ?? ''}
      </p>
      {helper ? (
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function ResponderGroup({
  group,
  groupIndex,
  answerColumns,
  forceExpanded,
  defaultExpanded,
}: {
  group: GroupedResponder;
  groupIndex: number;
  answerColumns: string[];
  forceExpanded: boolean;
  defaultExpanded: boolean;
}) {
  const t = useTranslations('forms');
  const [open, setOpen] = useState(defaultExpanded);
  const isOpen = forceExpanded || open;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-muted/30"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-semibold text-xs'
                )}
              >
                {groupIndex + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">{group.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('responses.total_submissions', {
                    count: group.responses.length,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0.5 text-[11px]"
              >
                {group.responses.length}
              </Badge>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-border/60 border-t">
            {group.responses.map((response, responseIndex) => (
              <div
                key={response.id}
                className={cn(
                  'px-5 py-4',
                  responseIndex > 0 && 'border-border/40 border-t'
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">
                    {t('responses.response_number', {
                      number: responseIndex + 1,
                    })}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {t('responses.submitted_at', {
                      time: new Date(response.submittedAt).toLocaleString(),
                    })}
                  </span>
                </div>
                {answerColumns.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('responses.no_answers')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {answerColumns.map((column) => {
                      const answer = response.answers[column];
                      if (!answer?.value) return null;
                      return (
                        <div
                          key={column}
                          className="flex flex-col gap-1.5 rounded-2xl border border-border/50 bg-background/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-6"
                        >
                          <span className="w-full shrink-0 font-medium text-muted-foreground text-xs uppercase tracking-wide sm:max-w-[200px] lg:max-w-[240px]">
                            {column}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="whitespace-pre-wrap font-medium text-sm">
                              {answer.value}
                            </p>
                            {answer.unresolvedValues.length > 0 ? (
                              <p className="text-dynamic-orange text-xs">
                                {t('responses.unmatched_answer_hint', {
                                  value: answer.unresolvedValues.join(', '),
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
