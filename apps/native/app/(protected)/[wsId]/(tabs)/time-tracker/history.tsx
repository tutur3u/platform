import { Ionicons } from '@expo/vector-icons';
import { useSessionHistoryQuery } from '@tuturuuu/hooks/hooks/use-session-history-query';
import type {
  TimeTrackingCategory,
  TimeTrackingPeriodStats,
  TimeTrackingSession,
} from '@tuturuuu/types';
import {
  formatTimeTrackerDateRange,
  getTimeTrackerPeriodBounds,
  type TimeTrackerViewMode,
} from '@tuturuuu/utils/time-tracker-period';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PeriodStats } from '@/components/time-tracker/period-stats';
import { formatDuration } from '@/hooks/features/time-tracker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createAuthorizedFetcher } from '@/lib/api/fetcher';
import { apiConfig } from '@/lib/config/api';
import { useSession } from '@/lib/stores/auth-store';
import { useWorkspaceId } from '@/lib/stores/workspace-store';

type ViewMode = TimeTrackerViewMode;

type SessionWithRelations = TimeTrackingSession & {
  category?: TimeTrackingCategory | null;
};

export default function SessionHistoryScreen() {
  const wsId = useWorkspaceId();
  const colorScheme = useColorScheme();
  const session = useSession();
  const userId = session?.user?.id ?? '';
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const userTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const handlePrevious = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'day') {
        next.setDate(next.getDate() - 1);
      } else if (viewMode === 'week') {
        next.setDate(next.getDate() - 7);
      } else if (viewMode === 'month') {
        next.setMonth(next.getMonth() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'day') {
        next.setDate(next.getDate() + 1);
      } else if (viewMode === 'week') {
        next.setDate(next.getDate() + 7);
      } else if (viewMode === 'month') {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const { startOfPeriod, endOfPeriod } = useMemo(
    () => getTimeTrackerPeriodBounds(currentDate, viewMode, userTimezone),
    [currentDate, viewMode, userTimezone]
  );

  const filters = useMemo(
    () => ({
      searchQuery: '',
      categoryId: 'all',
      duration: 'all',
      timeOfDay: 'all',
      projectContext: 'all',
    }),
    []
  );

  const fetcher = useMemo(
    () => createAuthorizedFetcher(session?.access_token),
    [session?.access_token]
  );

  const { sessions, sessionsQuery, periodStatsQuery } = useSessionHistoryQuery<
    SessionWithRelations,
    TimeTrackingPeriodStats
  >({
    wsId: wsId ?? '',
    userId,
    startOfPeriodIso: startOfPeriod.toISOString(),
    endOfPeriodIso: endOfPeriod.toISOString(),
    timezone: userTimezone,
    filters,
    baseUrl: apiConfig.baseUrl,
    fetcher,
    enabled: Boolean(wsId && userId),
  });

  const isLoading = sessionsQuery.isLoading || periodStatsQuery.isLoading;
  const error = sessionsQuery.error || periodStatsQuery.error;

  // Filter to completed sessions only
  const completedSessions = sessions?.filter((s) => s.end_time) ?? [];

  // Group sessions by date
  const groupedSessions = completedSessions.reduce(
    (groups, session) => {
      const date = new Date(session.start_time).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(session);
      return groups;
    },
    {} as Record<string, typeof completedSessions>
  );

  type SessionItem = NonNullable<typeof sessions>[number];

  const sections = Object.entries(groupedSessions)
    .map(([date, items]) => ({
      date,
      data: items as SessionItem[],
      totalDuration: (items as SessionItem[]).reduce(
        (total: number, item: SessionItem) => {
          const start = new Date(item.start_time).getTime();
          const end = item.end_time
            ? new Date(item.end_time).getTime()
            : Date.now();
          return total + (end - start);
        },
        0
      ),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const renderItem = ({ item }: { item: SessionItem }) => (
    <View className="mb-3 flex-row items-center rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-800">
      {/* Category Color */}
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: item.category?.color ?? '#e4e4e7',
        }}
      >
        <Ionicons
          name="time"
          size={20}
          color={item.category?.color ? '#fff' : '#71717a'}
        />
      </View>

      {/* Details */}
      <View className="flex-1">
        <Text className="font-semibold text-zinc-900 dark:text-white">
          {item.title ?? 'Work Session'}
        </Text>
        <View className="mt-1 flex-row items-center">
          {item.category && (
            <Text className="mr-2 text-sm text-zinc-500 dark:text-zinc-400">
              {item.category.name}
            </Text>
          )}
          <Text className="text-sm text-zinc-400 dark:text-zinc-500">
            {new Date(item.start_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' - '}
            {item.end_time
              ? new Date(item.end_time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Now'}
          </Text>
        </View>
      </View>

      {/* Duration */}
      <Text className="font-mono font-semibold text-base text-zinc-700 dark:text-zinc-300">
        {formatDuration(item.start_time, item.end_time)}
      </Text>
    </View>
  );

  const renderSectionHeader = (section: (typeof sections)[0]) => {
    const date = new Date(section.date);
    const isToday = date.toDateString() === new Date().toDateString();
    const totalHours = Math.floor(section.totalDuration / (1000 * 60 * 60));
    const totalMinutes = Math.floor(
      (section.totalDuration % (1000 * 60 * 60)) / (1000 * 60)
    );

    return (
      <View className="mt-6 mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View
            className={`mr-3 h-10 w-10 items-center justify-center rounded-full ${
              isToday ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
          >
            <Text
              className={`font-bold text-lg ${
                isToday ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {date.getDate()}
            </Text>
          </View>
          <View>
            <Text className="font-medium text-zinc-900 dark:text-white">
              {isToday
                ? 'Today'
                : date.toLocaleDateString(undefined, { weekday: 'long' })}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
        <Text className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
          Total: {totalHours > 0 ? `${totalHours}h ` : ''}
          {totalMinutes}m
        </Text>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="timer-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No sessions yet
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        Start tracking time to see your history
      </Text>
    </View>
  );

  // Flatten sections for FlatList
  type SectionType = (typeof sections)[number];
  type FlatItem =
    | ({ type: 'header' } & SectionType)
    | ({ type: 'item' } & SessionItem);

  const flatData: FlatItem[] = sections.flatMap((section) => [
    { type: 'header' as const, ...section },
    ...section.data.map((item) => ({ type: 'item' as const, ...item })),
  ]);

  const handleRefresh = useCallback(() => {
    sessionsQuery.refetch();
    periodStatsQuery.refetch();
  }, [sessionsQuery, periodStatsQuery]);

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      <View className="px-6 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/20">
              <Ionicons
                name="time"
                size={20}
                color={colorScheme === 'dark' ? '#fb923c' : '#ea580c'}
              />
            </View>
            <View>
              <Text className="font-bold text-lg text-zinc-900 dark:text-white">
                Session History
              </Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {periodStatsQuery.data?.sessionCount
                  ? `${periodStatsQuery.data.sessionCount} sessions`
                  : 'No sessions yet'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleToday}
            className="rounded-full bg-zinc-200 px-3 py-1 dark:bg-zinc-800"
          >
            <Text className="font-medium text-xs text-zinc-700 dark:text-zinc-300">
              Today
            </Text>
          </Pressable>
        </View>

        <View className="mt-6 flex-row items-center justify-between">
          <Pressable
            onPress={handlePrevious}
            className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-800"
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={colorScheme === 'dark' ? '#fff' : '#000'}
            />
          </Pressable>

          <Text className="font-semibold text-base text-zinc-900 dark:text-white">
            {formatTimeTrackerDateRange(startOfPeriod, endOfPeriod, viewMode)}
          </Text>

          <Pressable
            onPress={handleNext}
            className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-800"
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colorScheme === 'dark' ? '#fff' : '#000'}
            />
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center rounded-full bg-white p-1 shadow-sm dark:bg-zinc-800">
          {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              className={`flex-1 rounded-full px-3 py-2 ${
                viewMode === mode
                  ? 'bg-zinc-900 dark:bg-white'
                  : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-center font-semibold text-xs uppercase tracking-wide ${
                  viewMode === mode
                    ? 'text-white dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Error State */}
      {error && (
        <View className="mx-6 mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to load sessions'}
          </Text>
        </View>
      )}

      <FlatList
        data={flatData}
        keyExtractor={(item, index) =>
          item.type === 'header'
            ? `header-${item.date}`
            : (item.id ?? `item-${index}`)
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return renderSectionHeader(item as SectionType);
          }
          return renderItem({ item: item as SessionItem });
        }}
        ListHeaderComponent={
          <PeriodStats
            periodStats={periodStatsQuery.data}
            isLoading={periodStatsQuery.isLoading}
          />
        }
        contentContainerClassName="px-6 pb-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        onEndReached={() => {
          if (sessionsQuery.hasNextPage && !sessionsQuery.isFetchingNextPage) {
            sessionsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          sessionsQuery.isFetchingNextPage ? (
            <View className="py-6">
              <ActivityIndicator size="small" color="#f97316" />
            </View>
          ) : sessionsQuery.hasNextPage ? (
            <View className="py-6">
              <Pressable
                onPress={() => sessionsQuery.fetchNextPage()}
                className="rounded-full border border-zinc-200 px-4 py-2 dark:border-zinc-700"
              >
                <Text className="text-center font-medium text-sm text-zinc-600 dark:text-zinc-300">
                  Load more
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {isLoading && completedSessions.length === 0 && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
