'use client';

import { Calendar, TrendingUp, Zap } from '@tuturuuu/icons';
import { Card, CardContent } from '../../../../card';
import type { TimerStats } from '../../../../time-tracker/types';
import { formatDuration } from '../utils';

interface StatsCardsProps {
  stats: TimerStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-3 @lg:gap-4 gap-2">
      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="@lg:p-4 p-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-dynamic-blue transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="@lg:text-sm text-muted-foreground text-xs">Today</p>
              <p className="truncate font-medium @lg:text-base text-sm transition-all">
                {formatDuration(stats.todayTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="@lg:p-4 p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-dynamic-green transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="@lg:text-sm text-muted-foreground text-xs">Week</p>
              <p className="truncate font-medium @lg:text-base text-sm transition-all">
                {formatDuration(stats.weekTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="@lg:p-4 p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-dynamic-purple transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="@lg:text-sm text-muted-foreground text-xs">Month</p>
              <p className="truncate font-medium @lg:text-base text-sm transition-all">
                {formatDuration(stats.monthTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
