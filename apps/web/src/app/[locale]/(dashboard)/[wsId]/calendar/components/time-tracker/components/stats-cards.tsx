'use client';

import { Calendar, TrendingUp, Zap } from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { TimerStats } from '../../../../time-tracker/types';
import { formatDuration } from '../utils';

interface StatsCardsProps {
  stats: TimerStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 @lg:gap-4">
      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="p-3 @lg:p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-dynamic-blue transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs @lg:text-sm">Today</p>
              <p className="truncate font-medium text-sm transition-all @lg:text-base">
                {formatDuration(stats.todayTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="p-3 @lg:p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-dynamic-green transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs @lg:text-sm">Week</p>
              <p className="truncate font-medium text-sm transition-all @lg:text-base">
                {formatDuration(stats.weekTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
        <CardContent className="p-3 @lg:p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-dynamic-purple transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs @lg:text-sm">Month</p>
              <p className="truncate font-medium text-sm transition-all @lg:text-base">
                {formatDuration(stats.monthTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
