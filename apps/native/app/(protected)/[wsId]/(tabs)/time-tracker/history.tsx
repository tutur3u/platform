import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, useTimeSessions } from '@/hooks/features/time-tracker';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SessionHistoryScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const { data: sessions, isLoading, error, refetch } = useTimeSessions(wsId);

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
    <View className="mb-2 flex-row items-center rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
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
        <Text className="font-medium text-zinc-900 dark:text-white">
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
      <Text className="font-mono font-semibold text-lg text-zinc-700 dark:text-zinc-300">
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
      <View className="mt-6 mb-2 flex-row items-center justify-between">
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

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
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
        contentContainerClassName="px-6 pb-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
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
