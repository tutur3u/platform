import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { GroupIndicator, UserIndicator } from './types';

interface IndicatorSummaryStatsProps {
  groupIndicators: GroupIndicator[];
  userIndicators: UserIndicator[];
  userIds: Set<string>;
}

export function IndicatorSummaryStats({
  groupIndicators,
  userIndicators,
  userIds,
}: IndicatorSummaryStatsProps) {
  const tIndicators = useTranslations('ws-user-group-indicators');

  const { totalCells, filledCells } = useMemo(() => {
    const indicatorIds = new Set(groupIndicators.map((gi) => gi.id));
    const total = groupIndicators.length * userIds.size;
    const filled = userIndicators.filter(
      (ui) =>
        ui.value !== null &&
        ui.value !== undefined &&
        userIds.has(ui.user_id) &&
        indicatorIds.has(ui.indicator_id)
    ).length;
    return { totalCells: total, filledCells: filled };
  }, [groupIndicators, userIndicators, userIds]);
  const completionRate =
    totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            {tIndicators('total_indicators')}
          </p>
          <p className="mt-1 font-semibold text-2xl">
            {groupIndicators.length}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            {tIndicators('users_tracked')}
          </p>
          <p className="mt-1 font-semibold text-2xl">{userIds.size}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            {tIndicators('completion_rate')}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-semibold text-2xl">{completionRate}%</span>
            <Badge
              variant="outline"
              className={
                completionRate >= 80
                  ? 'border-dynamic-green/30 text-dynamic-green'
                  : completionRate >= 50
                    ? 'border-dynamic-orange/30 text-dynamic-orange'
                    : 'border-dynamic-red/30 text-dynamic-red'
              }
            >
              {tIndicators('completion_filled', {
                filled: filledCells,
                total: totalCells,
              })}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
