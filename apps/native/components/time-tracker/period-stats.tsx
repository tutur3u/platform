import { Ionicons } from '@expo/vector-icons';
import type { TimeTrackingPeriodStats } from '@tuturuuu/types';
import { ActivityIndicator, Text, View } from 'react-native';
import { formatDuration } from '@/hooks/features/time-tracker';
import { useColorScheme } from '@/hooks/use-color-scheme';

type PeriodStatsProps = {
  periodStats?: TimeTrackingPeriodStats;
  isLoading?: boolean;
};

const getCategoryColorRgb = (color: string): string => {
  const colorMap: Record<string, string> = {
    BLUE: '59, 130, 246',
    GREEN: '34, 197, 94',
    YELLOW: '234, 179, 8',
    RED: '239, 68, 68',
    PURPLE: '168, 85, 247',
    PINK: '236, 72, 153',
    ORANGE: '249, 115, 22',
    GRAY: '156, 163, 175',
  };

  return colorMap[color] || colorMap.GRAY;
};

const ProgressBar = ({
  percentage,
  color,
}: {
  percentage: number;
  color: string;
}) => {
  const colorScheme = useColorScheme();
  const rgb = getCategoryColorRgb(color);

  return (
    <View className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
      <View
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, percentage))}%`,
          backgroundColor: `rgb(${rgb})`,
        }}
      />
    </View>
  );
};

export function PeriodStats({ periodStats, isLoading }: PeriodStatsProps) {
  const colorScheme = useColorScheme();

  if (isLoading) {
    return (
      <View className="mb-6 min-h-[180px] items-center justify-center rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <ActivityIndicator
          size="small"
          color={colorScheme === 'dark' ? '#a1a1aa' : '#71717a'}
        />
        <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Loading stats...
        </Text>
      </View>
    );
  }

  if (!periodStats || periodStats.sessionCount === 0) return null;

  return (
    <View className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <View className="mb-3 flex-row items-center gap-2">
        <Ionicons
          name="stats-chart"
          size={16}
          color={colorScheme === 'dark' ? '#a1a1aa' : '#71717a'}
        />
        <Text className="font-medium text-sm text-zinc-600 dark:text-zinc-400">
          Summary
        </Text>
      </View>

      <View className="gap-4">
        {/* Total Time */}
        <View>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="font-medium text-sm text-zinc-900 dark:text-white">
              Total Time
            </Text>
            <Text className="font-bold text-sm text-zinc-900 dark:text-white">
              {formatDuration(
                new Date(
                  Date.now() - periodStats.totalDuration * 1000
                ).toISOString(),
                new Date().toISOString()
              )}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-zinc-900 dark:bg-white" />
        </View>

        {/* Category Breakdown */}
        {periodStats.breakdown.map(
          (cat: { name: string; duration: number; color: string }) => {
            const percentage =
              periodStats.totalDuration > 0
                ? (cat.duration / periodStats.totalDuration) * 100
                : 0;

            const rgb = getCategoryColorRgb(cat.color);

            return (
              <View key={cat.name}>
                <View className="mb-1 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: `rgb(${rgb})` }}
                    />
                    <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                      {cat.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text className="w-10 text-right text-xs text-zinc-500 dark:text-zinc-400">
                      {percentage.toFixed(0)}%
                    </Text>
                    <Text className="font-medium text-sm text-zinc-900 dark:text-white">
                      {formatDuration(
                        new Date(
                          Date.now() - cat.duration * 1000
                        ).toISOString(),
                        new Date().toISOString()
                      )}
                    </Text>
                  </View>
                </View>
                <ProgressBar percentage={percentage} color={cat.color} />
              </View>
            );
          }
        )}
      </View>
    </View>
  );
}
