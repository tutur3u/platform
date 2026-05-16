'use client';

import { ExternalLink, FileText, LineChart } from '@tuturuuu/icons';
import type {
  TeachCourseMember,
  TeachIndicator,
  TeachIndicatorValue,
  TeachReport,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { LEARN_APP_URL } from '@/constants/common';

export function ReportPreviewer({
  content,
  courseId,
  courseName,
  feedback,
  indicators,
  report,
  score,
  title,
  user,
  values,
  wsId,
}: {
  content: string;
  courseId: string;
  courseName: string;
  feedback: string;
  indicators: TeachIndicator[];
  report?: TeachReport | null;
  score: number | null;
  title: string;
  user?: TeachCourseMember;
  values: TeachIndicatorValue[];
  wsId: string;
}) {
  const locale = useLocale();
  const t = useTranslations('teachOperations');
  const learnerName =
    user?.full_name ?? user?.display_name ?? user?.email ?? t('learner');
  const reportDate = report?.created_at
    ? new Date(report.created_at).toLocaleDateString(locale, {
        dateStyle: 'medium',
      })
    : new Date().toLocaleDateString(locale, { dateStyle: 'medium' });
  const valuesByMetric = new Map(
    values.map((value) => [value.indicator_id, value])
  );
  const normalizedScore = Math.max(0, Math.min(100, score ?? 0));
  const learnCourseUrl = `${LEARN_APP_URL}/${wsId}/courses/${courseId}`;
  const learnReportsUrl = `${LEARN_APP_URL}/${wsId}/reports`;

  return (
    <article className="space-y-5 border-2 border-border bg-background p-5 shadow-[6px_6px_0_var(--border)]">
      <div className="flex flex-col gap-3 border-border border-b-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{courseName}</Badge>
            {report?.report_approval_status ? (
              <Badge
                className={cn(
                  report.report_approval_status === 'APPROVED' &&
                    'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
                  report.report_approval_status === 'REJECTED' &&
                    'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
                  report.report_approval_status === 'PENDING' &&
                    'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                )}
                variant="outline"
              >
                {t(`reportStatus.${report.report_approval_status}`)}
              </Badge>
            ) : (
              <Badge variant="outline">{t('draftPreview')}</Badge>
            )}
          </div>
          <h2 className="mt-3 font-black text-2xl tracking-normal">
            {title || t('reportTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {learnerName} · {reportDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={learnCourseUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              {t('openLearnCourse')}
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={learnReportsUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              {t('openLearnReports')}
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <PreviewBlock
            icon={FileText}
            label={t('reportContent')}
            value={content || t('previewEmptyContent')}
          />
          <PreviewBlock
            icon={LineChart}
            label={t('reportFeedback')}
            value={feedback || t('previewEmptyFeedback')}
          />
        </div>

        <aside className="space-y-4 border-2 border-border bg-muted/40 p-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-black">{t('reportScore')}</span>
              <span className="font-black">{score ?? '-'}</span>
            </div>
            <Progress className="mt-2 h-2" value={normalizedScore} />
          </div>
          <div className="space-y-2">
            <p className="font-black text-sm">{t('metricSnapshot')}</p>
            {indicators.length ? (
              indicators.map((indicator) => {
                const value = valuesByMetric.get(indicator.id)?.value;
                return (
                  <div
                    className="flex items-center justify-between gap-3 border-border border-b py-2 text-sm last:border-b-0"
                    key={indicator.id}
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {indicator.name}
                    </span>
                    <span className="font-black">
                      {value ?? '-'}
                      {indicator.unit ? (
                        <span className="ml-1 text-muted-foreground">
                          {indicator.unit}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('noMetricsYet')}
              </p>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

function PreviewBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <section className="rounded-none border-2 border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 font-black text-sm">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6">{value}</p>
    </section>
  );
}
