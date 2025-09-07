'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Globe, MapPin, Share2, TrendingUp } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';

interface GeographicAnalyticsProps {
  topReferrers: Array<{ domain: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
}

export function GeographicAnalytics({
  topReferrers,
  topCountries,
  topCities,
}: GeographicAnalyticsProps) {
  const t = useTranslations();

  return (
    <>
      {/* Top Referrers and Countries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Referrers */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-3">
              <div className="rounded-lg bg-dynamic-orange/10 p-2">
                <TrendingUp className="h-5 w-5 text-dynamic-orange" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {t('link-shortener.analytics.top_referrers')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.traffic_sources')}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="space-y-4">
              {topReferrers.length > 0 ? (
                <div className="space-y-3">
                  {topReferrers.slice(0, 6).map((referrer, index) => {
                    const maxCount = Math.max(
                      ...topReferrers.map((r) => r.count)
                    );
                    const percentage =
                      maxCount > 0 ? (referrer.count / maxCount) * 100 : 0;

                    return (
                      <div key={referrer.domain} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="h-5 w-5 rounded-full p-0 text-xs"
                            >
                              {index + 1}
                            </Badge>
                            <span className="truncate font-medium text-sm">
                              {referrer.domain}
                            </span>
                          </div>
                          <span className="font-semibold text-dynamic-orange">
                            {referrer.count}
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 py-8 text-center">
                  <Share2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {t('link-shortener.analytics.no_referrer_data')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Countries */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-3">
              <div className="rounded-lg bg-dynamic-green/10 p-2">
                <Globe className="h-5 w-5 text-dynamic-green" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {t('link-shortener.analytics.top_countries')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.geographic_distribution')}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="space-y-4">
              {topCountries.length > 0 ? (
                <div className="space-y-3">
                  {topCountries.slice(0, 6).map((country, index) => {
                    const maxCount = Math.max(
                      ...topCountries.map((c) => c.count)
                    );
                    const percentage =
                      maxCount > 0 ? (country.count / maxCount) * 100 : 0;

                    return (
                      <div key={country.country} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="h-5 w-5 rounded-full p-0 text-xs"
                            >
                              {index + 1}
                            </Badge>
                            <span className="truncate font-medium text-sm">
                              {decodeURIComponent(country.country)}
                            </span>
                          </div>
                          <span className="font-semibold text-dynamic-green">
                            {country.count}
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 py-8 text-center">
                  <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {t('link-shortener.analytics.no_country_data')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Cities */}
      {topCities.length > 0 && (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-3">
              <div className="rounded-lg bg-dynamic-purple/10 p-2">
                <MapPin className="h-5 w-5 text-dynamic-purple" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {t('link-shortener.analytics.top_cities')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.city_distribution')}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {topCities.slice(0, 12).map((city, index) => {
                const maxCount = Math.max(...topCities.map((c) => c.count));
                const percentage =
                  maxCount > 0 ? (city.count / maxCount) * 100 : 0;

                return (
                  <div
                    key={`${city.city}-${city.country}`}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="h-5 w-5 rounded-full p-0 text-xs"
                        >
                          {index + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-sm">
                            {decodeURIComponent(city.city)}
                          </div>
                          <div className="truncate text-muted-foreground text-xs">
                            {decodeURIComponent(city.country)}
                          </div>
                        </div>
                      </div>
                      <span className="font-semibold text-dynamic-purple">
                        {city.count}
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
