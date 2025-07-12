'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Globe,
  MousePointerClick,
  TrendingUp,
  Users,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface AnalyticsCardsProps {
  analytics: {
    total_clicks: number | null;
    unique_visitors: number | null;
    unique_referrers: number | null;
    unique_countries: number | null;
  };
}

export function AnalyticsCards({ analytics }: AnalyticsCardsProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-blue/5 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-dynamic-blue/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <div className="rounded-md bg-dynamic-blue/10 p-1.5 transition-colors group-hover:bg-dynamic-blue/20">
              <MousePointerClick className="h-4 w-4 text-dynamic-blue" />
            </div>
            {t('link-shortener.analytics.total_clicks')}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="mb-1 font-bold text-2xl text-dynamic-blue sm:text-3xl">
            {analytics?.total_clicks?.toLocaleString() || 0}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('link-shortener.analytics.all_time_clicks')}
          </p>
        </CardContent>
      </Card>

      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-green/5 via-dynamic-green/10 to-dynamic-green/5 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-dynamic-green/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <div className="rounded-md bg-dynamic-green/10 p-1.5 transition-colors group-hover:bg-dynamic-green/20">
              <Users className="h-4 w-4 text-dynamic-green" />
            </div>
            {t('link-shortener.analytics.unique_visitors')}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="mb-1 font-bold text-2xl text-dynamic-green sm:text-3xl">
            {analytics?.unique_visitors?.toLocaleString() || 0}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('link-shortener.analytics.unique_ip_addresses')}
          </p>
        </CardContent>
      </Card>

      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-orange/5 via-dynamic-orange/10 to-dynamic-orange/5 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-dynamic-orange/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <div className="rounded-md bg-dynamic-orange/10 p-1.5 transition-colors group-hover:bg-dynamic-orange/20">
              <TrendingUp className="h-4 w-4 text-dynamic-orange" />
            </div>
            {t('link-shortener.analytics.unique_referrers')}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="mb-1 font-bold text-2xl text-dynamic-orange sm:text-3xl">
            {analytics?.unique_referrers?.toLocaleString() || 0}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('link-shortener.analytics.traffic_sources')}
          </p>
        </CardContent>
      </Card>

      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-purple/5 via-dynamic-purple/10 to-dynamic-purple/5 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-dynamic-purple/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <div className="rounded-md bg-dynamic-purple/10 p-1.5 transition-colors group-hover:bg-dynamic-purple/20">
              <Globe className="h-4 w-4 text-dynamic-purple" />
            </div>
            {t('link-shortener.analytics.unique_countries')}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="mb-1 font-bold text-2xl text-dynamic-purple sm:text-3xl">
            {analytics?.unique_countries?.toLocaleString() || 0}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('link-shortener.analytics.geographic_reach')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
