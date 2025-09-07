'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface AnalyticsSummaryProps {
  analytics: {
    total_clicks: number | null;
    unique_visitors: number | null;
    first_click_at: string | null;
    last_click_at: string | null;
  };
}

export function AnalyticsSummary({ analytics }: AnalyticsSummaryProps) {
  const t = useTranslations();

  if (!analytics.first_click_at) {
    return null;
  }

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <CardContent className="relative p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {t('link-shortener.analytics.first_click')}
            </h4>
            <div className="space-y-1">
              <p className="font-semibold text-lg">
                {new Date(analytics.first_click_at).toLocaleDateString()}
              </p>
              <p className="text-muted-foreground text-sm">
                {new Date(analytics.first_click_at).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {t('link-shortener.analytics.last_click')}
            </h4>
            <div className="space-y-1">
              <p className="font-semibold text-lg">
                {analytics.last_click_at
                  ? new Date(analytics.last_click_at).toLocaleDateString()
                  : t('link-shortener.analytics.never')}
              </p>
              {analytics.last_click_at && (
                <p className="text-muted-foreground text-sm">
                  {new Date(analytics.last_click_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {t('link-shortener.analytics.avg_clicks_per_day')}
            </h4>
            <div className="space-y-1">
              <p className="font-semibold text-lg">
                {analytics.first_click_at
                  ? Math.round(
                      (analytics?.total_clicks || 0) /
                        Math.max(
                          1,
                          Math.ceil(
                            (Date.now() -
                              new Date(analytics.first_click_at).getTime()) /
                              (1000 * 60 * 60 * 24)
                          )
                        )
                    )
                  : 0}
              </p>
              <p className="text-muted-foreground text-sm">Daily average</p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {t('link-shortener.analytics.click_through_rate')}
            </h4>
            <div className="space-y-1">
              <p className="font-semibold text-lg">
                {analytics?.total_clicks &&
                analytics?.unique_visitors &&
                analytics.total_clicks > 0 &&
                analytics.unique_visitors > 0
                  ? (
                      (analytics.total_clicks / analytics.unique_visitors) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-muted-foreground text-sm">
                Clicks per visitor
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
