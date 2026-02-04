import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTaskBoards, useTaskMutations } from '@/hooks/features/tasks';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'normal', label: 'Normal', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500' },
] as const;

type PriorityValue = (typeof PRIORITY_OPTIONS)[number]['value'];

export default function CreateTaskScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const { data: boards, isLoading: boardsLoading } = useTaskBoards(wsId);
  const { createTask } = useTaskMutations(wsId ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PriorityValue>('normal');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Flatten lists from all boards for selection
  const allLists =
    boards?.flatMap((board) =>
      ((board.lists as Array<{ id: string; name: string | null }>) ?? []).map(
        (list) => ({
          ...list,
          boardName: board.name,
        })
      )
    ) ?? [];

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }

    if (!selectedListId) {
      Alert.alert('Error', 'Please select a list');
      return;
    }

    try {
      await createTask.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        priority,
        list_id: selectedListId,
      });
      router.back();
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to create task'
      );
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="p-6">
          {/* Task Name */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Task Name *
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter task name..."
              placeholderTextColor="#9ca3af"
              className="text-lg text-zinc-900 dark:text-white"
              autoFocus
            />
          </View>

          {/* Description */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description..."
              placeholderTextColor="#9ca3af"
              className="min-h-[80px] text-base text-zinc-900 dark:text-white"
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Priority */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-3 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Priority
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setPriority(option.value)}
                  className={`flex-row items-center rounded-full px-4 py-2 ${
                    priority === option.value
                      ? option.color
                      : 'bg-zinc-100 dark:bg-zinc-700'
                  }`}
                >
                  <Text
                    className={`font-medium text-sm ${
                      priority === option.value
                        ? 'text-white'
                        : 'text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* List Selection */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-3 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              List *
            </Text>
            {boardsLoading ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : allLists.length === 0 ? (
              <View className="items-center py-4">
                <Ionicons
                  name="list-outline"
                  size={32}
                  color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
                />
                <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
                  No lists available
                </Text>
                <Text className="text-sm text-zinc-400 dark:text-zinc-500">
                  Create a board first on the web app
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {allLists.map((list) => (
                  <Pressable
                    key={list.id}
                    onPress={() => setSelectedListId(list.id)}
                    className={`flex-row items-center rounded-lg p-3 ${
                      selectedListId === list.id
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : 'bg-zinc-50 active:bg-zinc-100 dark:bg-zinc-700 dark:active:bg-zinc-600'
                    }`}
                  >
                    <View
                      className={`mr-3 h-5 w-5 items-center justify-center rounded-full border-2 ${
                        selectedListId === list.id
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {selectedListId === list.id && (
                        <Ionicons name="checkmark" size={12} color="white" />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base text-zinc-900 dark:text-white">
                        {list.name}
                      </Text>
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                        {list.boardName}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Create Button */}
        <View className="border-zinc-200 border-t p-4 dark:border-zinc-800">
          <Pressable
            onPress={handleCreate}
            disabled={createTask.isPending || !name.trim() || !selectedListId}
            className={`rounded-xl py-4 ${
              createTask.isPending || !name.trim() || !selectedListId
                ? 'bg-blue-400'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {createTask.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center font-semibold text-white">
                Create Task
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
