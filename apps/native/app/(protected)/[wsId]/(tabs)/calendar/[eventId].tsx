import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useCalendarEvent,
  useCalendarMutations,
} from '@/hooks/features/calendar';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function EventDetailScreen() {
  const { wsId, eventId } = useLocalSearchParams<{
    wsId: string;
    eventId: string;
  }>();
  const colorScheme = useColorScheme();

  const { data: event, isLoading, error } = useCalendarEvent(wsId, eventId);
  const { deleteEvent } = useCalendarMutations(wsId ?? '');

  const handleDelete = () => {
    Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!eventId) return;
          try {
            await deleteEvent.mutateAsync(eventId);
            router.back();
          } catch (err) {
            Alert.alert(
              'Error',
              err instanceof Error ? err.message : 'Failed to delete event'
            );
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-900">
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
        />
        <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Event not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-lg bg-blue-600 px-6 py-3"
        >
          <Text className="font-medium text-white">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const startDate = new Date(event.start_at);
  const endDate = new Date(event.end_at);
  const isSameDay = startDate.toDateString() === endDate.toDateString();

  const formatDateTime = (date: Date) => {
    return date.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      <ScrollView contentContainerClassName="p-6">
        {/* Event Title */}
        <View className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-800">
          <View className="flex-row items-start">
            <View
              className="mr-4 h-4 w-4 rounded-full"
              style={{
                backgroundColor:
                  event.color ?? event.calendar?.color ?? '#3b82f6',
              }}
            />
            <View className="flex-1">
              <Text className="font-bold text-2xl text-zinc-900 dark:text-white">
                {event.title ?? 'Untitled Event'}
              </Text>
              {event.calendar?.name && (
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {event.calendar.name}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Date & Time */}
        <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
          <View className="mb-3 flex-row items-center">
            <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Ionicons name="time-outline" size={20} color="#3b82f6" />
            </View>
            <Text className="font-medium text-base text-zinc-900 dark:text-white">
              Date & Time
            </Text>
          </View>

          {isSameDay ? (
            <View className="ml-14">
              <Text className="text-base text-zinc-900 dark:text-white">
                {startDate.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <Text className="mt-1 text-zinc-500 dark:text-zinc-400">
                {formatTime(startDate)} - {formatTime(endDate)}
              </Text>
            </View>
          ) : (
            <View className="ml-14">
              <Text className="text-base text-zinc-900 dark:text-white">
                {formatDateTime(startDate)}
              </Text>
              <Text className="my-1 text-zinc-400">to</Text>
              <Text className="text-base text-zinc-900 dark:text-white">
                {formatDateTime(endDate)}
              </Text>
            </View>
          )}
        </View>

        {/* Location */}
        {event.location && (
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <View className="mb-3 flex-row items-center">
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Ionicons name="location-outline" size={20} color="#22c55e" />
              </View>
              <Text className="font-medium text-base text-zinc-900 dark:text-white">
                Location
              </Text>
            </View>
            <Text className="ml-14 text-base text-zinc-700 dark:text-zinc-300">
              {event.location}
            </Text>
          </View>
        )}

        {/* Description */}
        {event.description && (
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <View className="mb-3 flex-row items-center">
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#a855f7"
                />
              </View>
              <Text className="font-medium text-base text-zinc-900 dark:text-white">
                Description
              </Text>
            </View>
            <Text className="ml-14 text-base text-zinc-700 dark:text-zinc-300">
              {event.description}
            </Text>
          </View>
        )}

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          className="rounded-xl bg-red-50 py-4 active:bg-red-100 dark:bg-red-900/20 dark:active:bg-red-900/30"
        >
          <Text className="text-center font-medium text-red-600 dark:text-red-400">
            Delete Event
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
