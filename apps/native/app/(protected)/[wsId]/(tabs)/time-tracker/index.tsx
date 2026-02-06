import { Ionicons } from '@expo/vector-icons';
import { Link, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatDuration,
  formatDurationClock,
  useRunningSessions,
  useTimeCategories,
  useTimeSessions,
  useTimeTrackerMutations,
} from '@/hooks/features/time-tracker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/lib/stores';

export default function TimeTrackerScreen() {
const { wsId } = useGlobalSearchParams<{ wsId: string }>();
  
  // Log it to see exactly what is being captured
  console.log('Current Workspace ID:', wsId);
  const colorScheme = useColorScheme();
  const { user } = useAuthStore();

  const userId = user?.id ?? '';

  const { data: runningSession, isLoading: runningLoading } =
    useRunningSessions(wsId, userId);
  const { data: categories } = useTimeCategories(wsId);
  const { data: recentSessions } = useTimeSessions(wsId);
  const { startSession, stopSession } = useTimeTrackerMutations(
    wsId ?? '',
    userId
  );

  const [title, setTitle] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  const activeSession = runningSession?.[0];

  // Update elapsed time every second when session is running
  useEffect(() => {
    if (!activeSession) {
      setElapsedTime('00:00:00');
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(formatDurationClock(activeSession.start_time));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStart = async () => {
    try {
      await startSession.mutateAsync({
        title: title.trim() || 'Work Session',
        category_id: selectedCategoryId ?? undefined,
      });
      setTitle('');
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to start session'
      );
    }
  };

  const handleStop = async () => {
    if (!activeSession) return;

    try {
      await stopSession.mutateAsync(activeSession.id);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to stop session'
      );
    }
  };

  // Get last 5 completed sessions
  const completedSessions =
    recentSessions?.filter((s) => s.end_time).slice(0, 5) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-zinc-100 dark:bg-zinc-900">
      <ScrollView contentContainerClassName="p-6">
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="font-bold text-2xl text-zinc-900 dark:text-white">
            Time Tracker
          </Text>
          <Link
            href={`/(protected)/${wsId}/(tabs)/time-tracker/history`}
            asChild
          >
            <Pressable className="rounded-lg bg-zinc-200 px-3 py-2 active:bg-zinc-300 dark:bg-zinc-700 dark:active:bg-zinc-600">
              <Text className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
                History
              </Text>
            </Pressable>
          </Link>
        </View>

        {/* Timer Card */}
        <View className="mb-6 items-center rounded-2xl bg-white py-10 shadow-sm dark:bg-zinc-800">
          {runningLoading ? (
            <ActivityIndicator size="large" color="#3b82f6" />
          ) : activeSession ? (
            <>
              {/* Running Session */}
              <View className="mb-2 flex-row items-center">
                <View className="mr-2 h-3 w-3 animate-pulse rounded-full bg-red-500" />
                <Text className="font-medium text-red-500 text-sm">
                  Recording
                </Text>
              </View>
              <Text className="font-bold font-mono text-6xl text-zinc-900 dark:text-white">
                {elapsedTime}
              </Text>
              <Text className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                {activeSession.title ?? 'Work Session'}
              </Text>
              {activeSession.category && (
                <View
                  className="mt-2 rounded-full px-3 py-1"
                  style={{
                    backgroundColor: activeSession.category.color ?? '#e4e4e7',
                  }}
                >
                  <Text className="text-sm text-white">
                    {activeSession.category.name}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Ready to Start */}
              <Text className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
                Ready to track
              </Text>
              <Text className="font-bold font-mono text-6xl text-zinc-300 dark:text-zinc-600">
                00:00:00
              </Text>
            </>
          )}
        </View>

        {/* Start/Stop Button */}
        {activeSession ? (
          <Pressable
            onPress={handleStop}
            disabled={stopSession.isPending}
            className={`mb-6 rounded-xl py-5 ${
              stopSession.isPending
                ? 'bg-red-400'
                : 'bg-red-500 active:bg-red-600'
            }`}
          >
            {stopSession.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <View className="flex-row items-center justify-center">
                <Ionicons name="stop" size={24} color="white" />
                <Text className="ml-2 font-semibold text-lg text-white">
                  Stop
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          <>
            {/* Session Setup */}
            <View className="mb-4 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
              <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                Session Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What are you working on?"
                placeholderTextColor="#9ca3af"
                className="text-base text-zinc-900 dark:text-white"
              />
            </View>

            {/* Category Selection */}
            {categories && categories.length > 0 && (
              <View className="mb-6">
                <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                  Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setSelectedCategoryId(null)}
                      className={`rounded-full px-4 py-2 ${
                        selectedCategoryId === null
                          ? 'bg-blue-600'
                          : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                    >
                      <Text
                        className={`font-medium text-sm ${
                          selectedCategoryId === null
                            ? 'text-white'
                            : 'text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        None
                      </Text>
                    </Pressable>
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => setSelectedCategoryId(category.id)}
                        className="rounded-full px-4 py-2"
                        style={{
                          backgroundColor:
                            selectedCategoryId === category.id
                              ? (category.color ?? '#3b82f6')
                              : colorScheme === 'dark'
                                ? '#3f3f46'
                                : '#e4e4e7',
                        }}
                      >
                        <Text
                          className={`font-medium text-sm ${
                            selectedCategoryId === category.id
                              ? 'text-white'
                              : 'text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Pressable
              onPress={handleStart}
              disabled={startSession.isPending}
              className={`mb-6 rounded-xl py-5 ${
                startSession.isPending
                  ? 'bg-green-400'
                  : 'bg-green-500 active:bg-green-600'
              }`}
            >
              {startSession.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center justify-center">
                  <Ionicons name="play" size={24} color="white" />
                  <Text className="ml-2 font-semibold text-lg text-white">
                    Start
                  </Text>
                </View>
              )}
            </Pressable>
          </>
        )}

        {/* Recent Sessions */}
        {completedSessions.length > 0 && (
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
                Recent Sessions
              </Text>
              <Link
                href={`/(protected)/${wsId}/(tabs)/time-tracker/history`}
                asChild
              >
                <Pressable>
                  <Text className="text-blue-600 text-sm dark:text-blue-400">
                    See all
                  </Text>
                </Pressable>
              </Link>
            </View>
            <View className="rounded-xl bg-white shadow-sm dark:bg-zinc-800">
              {completedSessions.map((session, index) => (
                <View
                  key={session.id}
                  className={`flex-row items-center p-4 ${
                    index < completedSessions.length - 1
                      ? 'border-zinc-100 border-b dark:border-zinc-700'
                      : ''
                  }`}
                >
                  {/* Category Color */}
                  <View
                    className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: session.category?.color ?? '#e4e4e7',
                    }}
                  >
                    <Ionicons
                      name="time"
                      size={20}
                      color={session.category?.color ? '#fff' : '#71717a'}
                    />
                  </View>

                  {/* Details */}
                  <View className="flex-1">
                    <Text className="font-medium text-zinc-900 dark:text-white">
                      {session.title ?? 'Work Session'}
                    </Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                      {new Date(session.start_time).toLocaleDateString()}
                    </Text>
                  </View>

                  {/* Duration */}
                  <Text className="font-medium font-mono text-zinc-700 dark:text-zinc-300">
                    {formatDuration(session.start_time, session.end_time)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
