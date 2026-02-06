import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useWorkspace } from '@/hooks/features/workspaces';
import { useWorkspaceStore } from '@/lib/stores';

/**
 * Workspace-scoped layout
 *
 * Ensures the workspace is selected and provides workspace context
 * to all nested screens.
 */
export default function WorkspaceLayout() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { currentWorkspace } = useWorkspaceStore();
  const shouldFetchWorkspace = useMemo(
    () => !!wsId && currentWorkspace?.id !== wsId,
    [currentWorkspace?.id, wsId]
  );

  useWorkspace(wsId, { enabled: shouldFetchWorkspace });

  // Show loading if workspace in store doesn't match workspace in URL
  if (wsId && (!currentWorkspace || currentWorkspace.id !== wsId)) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-4 text-zinc-500 dark:text-zinc-400">
          Loading workspace...
        </Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
