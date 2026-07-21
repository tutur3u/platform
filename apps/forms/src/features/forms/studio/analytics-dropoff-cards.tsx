'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { useTranslations } from 'next-intl';

import type { FormAnalytics } from '../types';

export function renderDropoffSectionCard({
  t,
  analytics,
  maxDropoffSection,
}: {
  t: ReturnType<typeof useTranslations<'forms'>>;
  analytics: FormAnalytics;
  maxDropoffSection: number;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t('analytics.dropoff_by_section')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {analytics.dropoffBySection.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-6 text-muted-foreground text-sm">
            {t('analytics.no_dropoff_data')}
          </div>
        ) : (
          analytics.dropoffBySection.map((item) => (
            <div key={item.sectionId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 font-medium">{item.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-dynamic-red/60 transition-all"
                  style={{
                    width: `${(item.count / maxDropoffSection) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function renderDropoffQuestionCard({
  t,
  analytics,
  maxDropoffQuestion,
}: {
  t: ReturnType<typeof useTranslations<'forms'>>;
  analytics: FormAnalytics;
  maxDropoffQuestion: number;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t('analytics.dropoff_by_question')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {analytics.dropoffByQuestion.some((item) => item.count > 0) ? (
          analytics.dropoffByQuestion
            .filter((item) => item.count > 0)
            .map((item) => (
              <div key={item.questionId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{item.title}</span>
                  <span className="shrink-0 font-medium">{item.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-dynamic-orange/60 transition-all"
                    style={{
                      width: `${(item.count / maxDropoffQuestion) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-6 text-muted-foreground text-sm">
            {t('analytics.no_dropoff_data')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
