import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type TaskWithRelations, useTasks } from '@/hooks/features/tasks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TaskFilters } from '@/lib/query';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-yellow-500',
  low: 'bg-green-500',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export default function TasksScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const [filters, _setFilters] = useState<TaskFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useTasks(wsId, filters);
  const tasks = tasksData as TaskWithRelations[] | undefined;

  // Filter by search locally for responsiveness
  const filteredTasks = tasks?.filter((task) =>
    searchQuery
      ? task.name?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const handleSearch = (text: string) => {
    setSearchQuery(text);
  };

  const renderTaskItem = ({
    item,
  }: {
    item: NonNullable<typeof tasks>[number];
  }) => (
    <Link href={`/(protected)/${wsId}/(tabs)/tasks/${item.id}`} asChild>
      <Pressable className="mb-3 rounded-xl bg-white p-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
        <View className="flex-row items-start">
          {/* Priority Indicator */}
          <View
            className={`mt-1 mr-3 h-3 w-3 rounded-full ${
              PRIORITY_COLORS[item.priority ?? ''] ??
              'bg-zinc-300 dark:bg-zinc-600'
            }`}
          />

          <View className="flex-1">
            {/* Task Name */}
            <Text
              className="font-medium text-base text-zinc-900 dark:text-white"
              numberOfLines={2}
            >
              {item.name ?? 'Untitled Task'}
            </Text>

            {/* Description */}
            {item.description && (
              <Text
                className="mt-1 text-sm text-zinc-500 dark:text-zinc-400"
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}

            {/* Metadata Row */}
            <View className="mt-2 flex-row flex-wrap items-center">
              {/* Priority Badge */}
              {item.priority && (
                <View
                  className={`mr-2 rounded-full px-2 py-0.5 ${
                    PRIORITY_COLORS[item.priority] ?? 'bg-zinc-300'
                  }`}
                >
                  <Text className="font-medium text-white text-xs">
                    {PRIORITY_LABELS[item.priority] ?? item.priority}
                  </Text>
                </View>
              )}

              {/* Due Date */}
              {item.end_date && (
                <View className="mr-2 flex-row items-center">
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color={colorScheme === 'dark' ? '#a1a1aa' : '#71717a'}
                  />
                  <Text className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(item.end_date)}
                  </Text>
                </View>
              )}

              {/* List Name */}
              {item.list?.name && (
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  in {item.list.name}
                </Text>
              )}
            </View>
          </View>

          {/* Chevron */}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
          />
        </View>
      </Pressable>
    </Link>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="checkbox-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No tasks found
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        {searchQuery
          ? 'Try a different search term'
          : 'Create your first task to get started'}
      </Text>
      {!searchQuery && (
        <Link href={`/(protected)/${wsId}/(tabs)/tasks/create`} asChild>
          <Pressable className="mt-4 rounded-lg bg-blue-600 px-6 py-3 active:bg-blue-700">
            <Text className="font-medium text-white">Create Task</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-zinc-100 dark:bg-zinc-900">
      {/* Header */}
      <View className="border-zinc-200 border-b px-6 py-4 dark:border-zinc-800">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-2xl text-zinc-900 dark:text-white">
            Tasks
          </Text>
          <Link href={`/(protected)/${wsId}/(tabs)/tasks/create`} asChild>
            <Pressable className="rounded-full bg-blue-600 p-2 active:bg-blue-700">
              <Ionicons name="add" size={24} color="white" />
            </Pressable>
          </Link>
        </View>

        {/* Search Bar */}
        <View className="mt-4 flex-row items-center rounded-lg bg-zinc-200 px-3 py-2 dark:bg-zinc-800">
          <Ionicons
            name="search"
            size={20}
            color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
          />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search tasks..."
            placeholderTextColor={
              colorScheme === 'dark' ? '#71717a' : '#a1a1aa'
            }
            className="ml-2 flex-1 text-base text-zinc-900 dark:text-white"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons
                name="close-circle"
                size={20}
                color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Error State */}
      {error && (
        <View className="mx-6 mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to load tasks'}
          </Text>
          <Pressable onPress={() => refetch()} className="mt-2 self-start">
            <Text className="font-medium text-red-700 dark:text-red-300">
              Try again
            </Text>
          </Pressable>
        </View>
      )}

      {/* Task List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTaskItem}
        contentContainerClassName="p-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />

      {/* Loading State */}
      {isLoading && (!tasks || tasks.length === 0) && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 7) return `In ${days} days`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
