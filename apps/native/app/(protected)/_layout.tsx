import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/lib/stores';

/**
 * Protected layout - only accessible when authenticated
 *
 * Redirects to login if user is not authenticated.
 * Shows loading state while checking auth.
 */
export default function ProtectedLayout() {
  const { isInitialized, session, isLoading } = useAuthStore();

  // Show loading while initializing auth
  if (!isInitialized || isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="workspace-select" />
      <Stack.Screen name="[wsId]" />
    </Stack>
  );
}
