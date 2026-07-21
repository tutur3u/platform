'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
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

import type { FormResponsesQuestionAnalytics } from '../types';
import { ChartTooltipContent } from './chart-tooltip-content';

export function QuestionAnalyticsCard({
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
