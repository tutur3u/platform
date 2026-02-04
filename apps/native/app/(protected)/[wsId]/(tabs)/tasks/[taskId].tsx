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
import { useTask, useTaskMutations } from '@/hooks/features/tasks';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'normal', label: 'Normal', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
] as const;

type PriorityValue = (typeof PRIORITY_OPTIONS)[number]['value'] | null;

export default function TaskDetailScreen() {
  const { wsId, taskId } = useLocalSearchParams<{
    wsId: string;
    taskId: string;
  }>();
  const colorScheme = useColorScheme();

  const { data: task, isLoading, error } = useTask(wsId, taskId);
  const { updateTask, deleteTask } = useTaskMutations(wsId ?? '');

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriority, setEditedPriority] = useState<PriorityValue>(null);

  const startEditing = () => {
    setEditedName(task?.name ?? '');
    setEditedDescription(task?.description ?? '');
    setEditedPriority((task?.priority as PriorityValue) ?? null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!taskId) return;

    try {
      await updateTask.mutateAsync({
        taskId,
        updates: {
          name: editedName,
          description: editedDescription,
          priority: editedPriority,
        },
      });
      setIsEditing(false);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to update task'
      );
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!taskId) return;
          try {
            await deleteTask.mutateAsync(taskId);
            router.back();
          } catch (err) {
            Alert.alert(
              'Error',
              err instanceof Error ? err.message : 'Failed to delete task'
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

  if (error || !task) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-900">
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
        />
        <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Task not found
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

  const currentPriority = isEditing
    ? editedPriority
    : (task.priority as PriorityValue);
  const priorityOption = PRIORITY_OPTIONS.find(
    (p) => p.value === currentPriority
  );

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
            {isEditing ? (
              <TextInput
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Task name"
                placeholderTextColor="#9ca3af"
                className="font-semibold text-xl text-zinc-900 dark:text-white"
                multiline
              />
            ) : (
              <Text className="font-semibold text-xl text-zinc-900 dark:text-white">
                {task.name ?? 'Untitled Task'}
              </Text>
            )}

            {/* List Info */}
            {task.list && (
              <View className="mt-2 flex-row items-center">
                <Ionicons
                  name="list-outline"
                  size={16}
                  color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
                />
                <Text className="ml-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {task.list.board?.name} / {task.list.name}
                </Text>
              </View>
            )}
          </View>

          {/* Priority */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-3 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Priority
            </Text>
            {isEditing ? (
              <View className="flex-row flex-wrap gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setEditedPriority(option.value)}
                    className={`flex-row items-center rounded-full px-4 py-2 ${
                      editedPriority === option.value
                        ? option.color
                        : 'bg-zinc-100 dark:bg-zinc-700'
                    }`}
                  >
                    <Text
                      className={`font-medium text-sm ${
                        editedPriority === option.value
                          ? 'text-white'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View className="flex-row items-center">
                <View
                  className={`mr-2 h-4 w-4 rounded-full ${priorityOption?.color ?? 'bg-zinc-300'}`}
                />
                <Text className="text-base text-zinc-900 dark:text-white">
                  {priorityOption?.label ?? 'None'}
                </Text>
              </View>
            )}
          </View>

          {/* Description */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-3 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Description
            </Text>
            {isEditing ? (
              <TextInput
                value={editedDescription}
                onChangeText={setEditedDescription}
                placeholder="Add a description..."
                placeholderTextColor="#9ca3af"
                className="min-h-[100px] text-base text-zinc-900 dark:text-white"
                multiline
                textAlignVertical="top"
              />
            ) : (
              <Text className="text-base text-zinc-900 dark:text-white">
                {task.description ?? 'No description'}
              </Text>
            )}
          </View>

          {/* Dates */}
          <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <View className="flex-row justify-between">
              <View className="flex-1">
                <Text className="mb-1 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                  Start Date
                </Text>
                <Text className="text-base text-zinc-900 dark:text-white">
                  {task.start_date
                    ? new Date(task.start_date).toLocaleDateString()
                    : 'Not set'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="mb-1 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                  Due Date
                </Text>
                <Text className="text-base text-zinc-900 dark:text-white">
                  {task.end_date
                    ? new Date(task.end_date).toLocaleDateString()
                    : 'Not set'}
                </Text>
              </View>
            </View>
          </View>

          {/* Assignees */}
          {task.assignees && task.assignees.length > 0 && (
            <View className="mb-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
              <Text className="mb-3 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                Assignees
              </Text>
              {task.assignees.map((assignee, index) => {
                if (!assignee) return null;
                return (
                  <View key={index} className="flex-row items-center py-1">
                    <View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <Text className="font-medium text-sm text-zinc-600 dark:text-zinc-400">
                        {assignee.user?.display_name
                          ?.charAt(0)
                          ?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text className="text-base text-zinc-900 dark:text-white">
                      {assignee.user?.display_name ?? 'Unknown'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Delete Button (non-edit mode) */}
          {!isEditing && (
            <Pressable
              onPress={handleDelete}
              className="rounded-xl bg-red-50 py-4 active:bg-red-100 dark:bg-red-900/20 dark:active:bg-red-900/30"
            >
              <Text className="text-center font-medium text-red-600 dark:text-red-400">
                Delete Task
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Bottom Action Bar */}
        <View className="border-zinc-200 border-t p-4 dark:border-zinc-800">
          {isEditing ? (
            <View className="flex-row gap-3">
              <Pressable
                onPress={cancelEditing}
                className="flex-1 rounded-xl border border-zinc-300 py-4 active:bg-zinc-50 dark:border-zinc-700 dark:active:bg-zinc-800"
              >
                <Text className="text-center font-medium text-zinc-700 dark:text-zinc-300">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={updateTask.isPending}
                className={`flex-1 rounded-xl py-4 ${
                  updateTask.isPending
                    ? 'bg-blue-400'
                    : 'bg-blue-600 active:bg-blue-700'
                }`}
              >
                {updateTask.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center font-semibold text-white">
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={startEditing}
              className="rounded-xl bg-blue-600 py-4 active:bg-blue-700"
            >
              <Text className="text-center font-semibold text-white">
                Edit Task
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
