import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useWorkspaceStore } from '@/lib/stores';

/**
 * Workspace-scoped layout
 *
 * Ensures the workspace is selected and provides workspace context
 * to all nested screens.
 */
export default function WorkspaceLayout() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { selectWorkspaceById, currentWorkspace } = useWorkspaceStore();

  // Ensure workspace is selected when navigating directly via deep link
  useEffect(() => {
    if (wsId && (!currentWorkspace || currentWorkspace.id !== wsId)) {
      selectWorkspaceById(wsId);
    }
  }, [wsId, currentWorkspace, selectWorkspaceById]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
