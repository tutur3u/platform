'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { DailyActivity } from '@/lib/time-tracking-helper';
import { ActivityHeatmap } from './activity-heatmap';

dayjs.extend(utc);
dayjs.extend(timezone);

type HeatmapCardClientProps = {
  wsId: string;
  userId: string;
  isPersonal: boolean;
};

export function HeatmapCardClient({
  wsId,
  userId,
  isPersonal,
}: HeatmapCardClientProps) {
  const userTimezone = dayjs.tz.guess();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['time-tracker-stats', wsId, userId, userTimezone, 'heatmap'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracker/stats?userId=${userId}&isPersonal=${isPersonal}&timezone=${userTimezone}&daysBack=365`
      );
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json() as Promise<{
        dailyActivity: DailyActivity[];
      }>;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes (heatmap data changes slowly)
    refetchOnWindowFocus: false, // Don't refetch on window focus
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  if (statsLoading) {
    return (
      <Card className="relative overflow-x-auto">
        <div className="flex items-center gap-3 p-6">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <CardContent>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-x-auto">
      <CardContent className="pt-6">
        <div className="relative overflow-visible">
          <ActivityHeatmap dailyActivity={stats?.dailyActivity} />
        </div>
      </CardContent>
    </Card>
  );
}
