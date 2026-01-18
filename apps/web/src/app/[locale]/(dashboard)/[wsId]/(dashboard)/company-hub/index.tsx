'use client';

import { Building2, CalendarDays, Clock, Trophy } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BirthdayCountdownCard } from './birthday-countdown-card';
import { ChristmasLaunchCard } from './christmas-launch-card';
import { JapanCountdownCard } from './japan-countdown-card';
import { MilestonesSection } from './milestones-section';
import { QuarterTimeline } from './quarter-timeline';
import { TetCountdownCard } from './tet-countdown-card';
import type { YearInfo } from './types';
import { calculateYearInfo } from './utils';

export function CompanyHub() {
  const t = useTranslations('dashboard');
  const [yearInfo, setYearInfo] = useState<YearInfo>(calculateYearInfo);

  useEffect(() => {
    const timer = setInterval(() => setYearInfo(calculateYearInfo()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/2 via-transparent to-dynamic-blue/2" />

      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-dynamic-blue/20 shadow-sm">
              <Building2 className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">
                {t('year_schedule.title')}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                {t('year_schedule.fiscal_year_range', {
                  startYear: yearInfo.fiscalYear,
                  endYear: yearInfo.fiscalYear + 1,
                })}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            FY{yearInfo.fiscalYear}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <Tabs defaultValue="fiscal" className="w-full">
          <TabsList className="mb-3 h-8 w-full">
            <TabsTrigger value="countdowns" className="w-full gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Countdowns</span>
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="w-full gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fiscal Year</span>
            </TabsTrigger>
            <TabsTrigger value="milestones" className="w-full gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Milestones</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="countdowns" className="mt-0">
            <div className="grid gap-4 overflow-y-auto md:max-h-96">
              <BirthdayCountdownCard />
              <TetCountdownCard />
              <ChristmasLaunchCard />
              <JapanCountdownCard />
            </div>
          </TabsContent>

          <TabsContent value="fiscal" className="mt-0">
            <QuarterTimeline yearInfo={yearInfo} />
          </TabsContent>

          <TabsContent value="milestones" className="mt-0">
            <MilestonesSection yearInfo={yearInfo} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CompanyHub;
