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
  isDark,
}: {
  percentage: number;
  color: string;
  isDark: boolean;
}) => {
  const rgb = getCategoryColorRgb(color);

  return (
    <View
      style={{
        height: 8,
        overflow: 'hidden',
        borderRadius: 9999,
        backgroundColor: isDark ? '#3f3f46' : '#e4e4e7',
      }}
    >
      <View
        style={{
          height: '100%',
          borderRadius: 9999,
          width: `${Math.min(100, Math.max(0, percentage))}%`,
          backgroundColor: `rgb(${rgb})`,
        }}
      />
    </View>
  );
};

export function PeriodStats({ periodStats, isLoading }: PeriodStatsProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (isLoading) {
    return (
      <View
        style={{
          marginBottom: 24,
          minHeight: 180,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#3f3f46' : '#e4e4e7',
          backgroundColor: isDark ? '#27272a' : '#fff',
          padding: 16,
        }}
      >
        <ActivityIndicator
          size="small"
          color={isDark ? '#a1a1aa' : '#71717a'}
        />
        <Text
          style={{
            marginTop: 8,
            fontSize: 12,
            color: isDark ? '#a1a1aa' : '#71717a',
          }}
        >
          Loading stats...
        </Text>
      </View>
    );
  }

  if (!periodStats || periodStats.sessionCount === 0) return null;

  return (
    <View
      style={{
        marginBottom: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? '#3f3f46' : '#e4e4e7',
        backgroundColor: isDark ? '#27272a' : '#fff',
        padding: 16,
      }}
    >
      <View
        style={{
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ionicons
          name="stats-chart"
          size={16}
          color={isDark ? '#a1a1aa' : '#71717a'}
        />
        <Text
          style={{
            fontWeight: '500',
            fontSize: 14,
            color: isDark ? '#a1a1aa' : '#52525b',
          }}
        >
          Summary
        </Text>
      </View>

      <View style={{ gap: 16 }}>
        {/* Total Time */}
        <View>
          <View
            style={{
              marginBottom: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontWeight: '500',
                fontSize: 14,
                color: isDark ? '#fff' : '#18181b',
              }}
            >
              Total Time
            </Text>
            <Text
              style={{
                fontWeight: '700',
                fontSize: 14,
                color: isDark ? '#fff' : '#18181b',
              }}
            >
              {formatDuration(
                new Date(
                  Date.now() - periodStats.totalDuration * 1000
                ).toISOString(),
                new Date().toISOString()
              )}
            </Text>
          </View>
          <View
            style={{
              height: 8,
              overflow: 'hidden',
              borderRadius: 9999,
              backgroundColor: isDark ? '#fff' : '#18181b',
            }}
          />
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
                <View
                  style={{
                    marginBottom: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        height: 8,
                        width: 8,
                        borderRadius: 9999,
                        backgroundColor: `rgb(${rgb})`,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        color: isDark ? '#d4d4d8' : '#3f3f46',
                      }}
                    >
                      {cat.name}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        width: 40,
                        textAlign: 'right',
                        fontSize: 12,
                        color: isDark ? '#a1a1aa' : '#71717a',
                      }}
                    >
                      {percentage.toFixed(0)}%
                    </Text>
                    <Text
                      style={{
                        fontWeight: '500',
                        fontSize: 14,
                        color: isDark ? '#fff' : '#18181b',
                      }}
                    >
                      {formatDuration(
                        new Date(
                          Date.now() - cat.duration * 1000
                        ).toISOString(),
                        new Date().toISOString()
                      )}
                    </Text>
                  </View>
                </View>
                <ProgressBar
                  percentage={percentage}
                  color={cat.color}
                  isDark={isDark}
                />
              </View>
            );
          }
        )}
      </View>
    </View>
  );
}
