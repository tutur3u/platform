'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Monitor, Smartphone, Wifi } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';

interface DeviceAnalyticsProps {
  deviceTypes: Array<{ device_type: string; count: number }>;
  browsers: Array<{ browser: string; count: number }>;
  operatingSystems: Array<{ os: string; count: number }>;
  totalClicks: number;
}

export function DeviceAnalytics({
  deviceTypes,
  browsers,
  operatingSystems,
  totalClicks,
}: DeviceAnalyticsProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Device Types */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-dynamic-purple/10 p-2">
              <Monitor className="h-5 w-5 text-dynamic-purple" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {t('link-shortener.analytics.device_types')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('link-shortener.analytics.device_breakdown')}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-4">
            {deviceTypes.length > 0 ? (
              <div className="space-y-3">
                {deviceTypes.map((device) => {
                  const maxCount = Math.max(...deviceTypes.map((d) => d.count));
                  const percentage =
                    maxCount > 0 ? (device.count / maxCount) * 100 : 0;
                  const DeviceIcon =
                    device.device_type === 'mobile' ? Smartphone : Monitor;

                  return (
                    <div key={device.device_type} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DeviceIcon className="h-4 w-4 text-dynamic-purple" />
                          <span className="font-medium text-sm capitalize">
                            {device.device_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-dynamic-purple">
                            {device.count}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            (
                            {(
                              (device.count / (totalClicks || 1)) *
                              100
                            ).toFixed(1)}
                            %)
                          </span>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 py-8 text-center">
                <Monitor className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {t('link-shortener.analytics.no_device_data')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Browsers */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-dynamic-blue/10 p-2">
              <Wifi className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {t('link-shortener.analytics.top_browsers')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('link-shortener.analytics.browser_distribution')}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-4">
            {browsers.length > 0 ? (
              <div className="space-y-3">
                {browsers.slice(0, 5).map((browser, index) => {
                  const maxCount = Math.max(...browsers.map((b) => b.count));
                  const percentage =
                    maxCount > 0 ? (browser.count / maxCount) * 100 : 0;

                  return (
                    <div key={browser.browser} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="h-5 w-5 rounded-full p-0 text-xs"
                          >
                            {index + 1}
                          </Badge>
                          <span className="font-medium text-sm">
                            {browser.browser}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-dynamic-blue">
                            {browser.count}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            (
                            {(
                              (browser.count / (totalClicks || 1)) *
                              100
                            ).toFixed(1)}
                            %)
                          </span>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 py-8 text-center">
                <Wifi className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {t('link-shortener.analytics.no_browser_data')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Operating Systems */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-dynamic-orange/10 p-2">
              <Monitor className="h-5 w-5 text-dynamic-orange" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {t('link-shortener.analytics.operating_systems')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('link-shortener.analytics.os_distribution')}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-4">
            {operatingSystems.length > 0 ? (
              <div className="space-y-3">
                {operatingSystems.slice(0, 5).map((os, index) => {
                  const maxCount = Math.max(
                    ...operatingSystems.map((o) => o.count)
                  );
                  const percentage =
                    maxCount > 0 ? (os.count / maxCount) * 100 : 0;

                  return (
                    <div key={os.os} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="h-5 w-5 rounded-full p-0 text-xs"
                          >
                            {index + 1}
                          </Badge>
                          <span className="font-medium text-sm">{os.os}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-dynamic-orange">
                            {os.count}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            (
                            {((os.count / (totalClicks || 1)) * 100).toFixed(1)}
                            %)
                          </span>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 py-8 text-center">
                <Monitor className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {t('link-shortener.analytics.no_os_data')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
