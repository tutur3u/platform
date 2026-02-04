import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type CalendarEventWithRelations,
  getDateRange,
  useCalendarEvents,
} from '@/hooks/features/calendar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCalendarView, useUIStore } from '@/lib/stores';

type CalendarView = 'agenda' | 'day' | '3day' | 'week' | 'month';

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'agenda', label: 'Agenda' },
  { value: 'day', label: 'Day' },
  { value: '3day', label: '3 Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function CalendarScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const currentView = useCalendarView();
  const { setCalendarView } = useUIStore();

  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange = useMemo(
    () => getDateRange(currentView, selectedDate),
    [currentView, selectedDate]
  );

  const {
    data: eventsData,
    isLoading,
    error,
    refetch,
  } = useCalendarEvents(wsId, dateRange);
  const events = eventsData as CalendarEventWithRelations[] | undefined;

  // Group events by date for agenda view
  const groupedEvents = useMemo(() => {
    if (!events) return [];

    const groups: Record<string, typeof events> = {};
    events.forEach((event) => {
      const dateKey = new Date(event.start_at).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    return Object.entries(groups)
      .map(([date, items]) => ({
        title: date,
        data: items,
      }))
      .sort(
        (a, b) => new Date(a.title).getTime() - new Date(b.title).getTime()
      );
  }, [events]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    switch (currentView) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
      case '3day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 3 : -3));
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        break;
      case 'agenda':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 30 : -30));
        break;
    }
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const renderEventItem = ({
    item,
  }: {
    item: NonNullable<typeof events>[number];
  }) => {
    const startTime = new Date(item.start_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = new Date(item.end_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <Link href={`/(protected)/${wsId}/(tabs)/calendar/${item.id}`} asChild>
        <Pressable className="mb-2 flex-row rounded-lg bg-white p-3 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
          {/* Color indicator */}
          <View
            className="mr-3 w-1 rounded-full"
            style={{
              backgroundColor: item.color ?? item.calendar?.color ?? '#3b82f6',
            }}
          />

          <View className="flex-1">
            <Text
              className="font-medium text-zinc-900 dark:text-white"
              numberOfLines={1}
            >
              {item.title ?? 'Untitled Event'}
            </Text>
            <Text className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {startTime} - {endTime}
            </Text>
            {item.location && (
              <View className="mt-1 flex-row items-center">
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
                />
                <Text
                  className="ml-1 text-xs text-zinc-400 dark:text-zinc-500"
                  numberOfLines={1}
                >
                  {item.location}
                </Text>
              </View>
            )}
          </View>

          <Ionicons
            name="chevron-forward"
            size={16}
            color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
          />
        </Pressable>
      </Link>
    );
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: string; data: typeof events };
  }) => {
    const date = new Date(section.title);
    const isToday = date.toDateString() === new Date().toDateString();

    return (
      <View className="mt-4 mb-2 flex-row items-center">
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
            {date.toLocaleDateString(undefined, { weekday: 'long' })}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {date.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="calendar-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No events
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        No events scheduled for this period
      </Text>
    </View>
  );

  const getDateDisplayText = () => {
    switch (currentView) {
      case 'day':
        return selectedDate.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      case '3day':
      case 'week': {
        const endDate = new Date(selectedDate);
        endDate.setDate(endDate.getDate() + (currentView === '3day' ? 2 : 6));
        return `${selectedDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })} - ${endDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}`;
      }
      case 'month':
        return selectedDate.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
      case 'agenda':
        return 'Upcoming Events';
      default:
        return '';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-100 dark:bg-zinc-900">
      {/* Header */}
      <View className="border-zinc-200 border-b px-6 py-4 dark:border-zinc-800">
        {/* Title Row */}
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-2xl text-zinc-900 dark:text-white">
            Calendar
          </Text>
          <Pressable
            onPress={goToToday}
            className="rounded-lg bg-blue-600 px-3 py-1.5 active:bg-blue-700"
          >
            <Text className="font-medium text-sm text-white">Today</Text>
          </Pressable>
        </View>

        {/* View Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4"
        >
          <View className="flex-row gap-2">
            {VIEW_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setCalendarView(option.value)}
                className={`rounded-full px-4 py-2 ${
                  currentView === option.value
                    ? 'bg-blue-600'
                    : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <Text
                  className={`font-medium text-sm ${
                    currentView === option.value
                      ? 'text-white'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Date Navigation */}
        <View className="mt-4 flex-row items-center justify-between">
          <Pressable
            onPress={() => navigateDate('prev')}
            className="rounded-full p-2 active:bg-zinc-200 dark:active:bg-zinc-700"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colorScheme === 'dark' ? '#a1a1aa' : '#52525b'}
            />
          </Pressable>
          <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
            {getDateDisplayText()}
          </Text>
          <Pressable
            onPress={() => navigateDate('next')}
            className="rounded-full p-2 active:bg-zinc-200 dark:active:bg-zinc-700"
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colorScheme === 'dark' ? '#a1a1aa' : '#52525b'}
            />
          </Pressable>
        </View>
      </View>

      {/* Error State */}
      {error && (
        <View className="mx-6 mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to load events'}
          </Text>
          <Pressable onPress={() => refetch()} className="mt-2 self-start">
            <Text className="font-medium text-red-700 dark:text-red-300">
              Try again
            </Text>
          </Pressable>
        </View>
      )}

      {/* Events List */}
      {currentView === 'agenda' ? (
        <SectionList
          sections={groupedEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerClassName="p-6 flex-grow"
          ListEmptyComponent={!isLoading ? renderEmptyState : null}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
        />
      ) : (
        <ScrollView
          contentContainerClassName="p-6 flex-grow"
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
        >
          {!isLoading && (!events || events.length === 0)
            ? renderEmptyState()
            : events?.map((event) => (
                <View key={event.id}>{renderEventItem({ item: event })}</View>
              ))}
        </ScrollView>
      )}

      {/* Loading Overlay */}
      {isLoading && (!events || events.length === 0) && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
