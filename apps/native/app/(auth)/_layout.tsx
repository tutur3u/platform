import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/lib/stores';

/**
 * Auth layout - accessible only when NOT authenticated
 *
 * Redirects to protected routes if user is already logged in.
 */
export default function AuthLayout() {
  const { isInitialized, session } = useAuthStore();

  // Show loading indicator while auth initializes
  if (!isInitialized) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect to protected area if already authenticated
  if (session) {
    return <Redirect href="/(protected)/workspace-select" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
