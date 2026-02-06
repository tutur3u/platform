import '../global.css';

import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProviders } from '@/lib/providers';
import { useAuthStore } from '@/lib/stores';
import { NAV_THEME } from '@/lib/theme';

// Keep splash screen visible while we initialize auth
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  // Start at public home, will redirect to auth/protected as needed
  initialRouteName: '(tabs)',
};

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const { isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized) {
      // Hide splash screen once auth is initialized
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  return (
    <ThemeProvider
      value={colorScheme === 'dark' ? NAV_THEME.dark : NAV_THEME.light}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(protected)" />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal', headerShown: true }}
        />
      </Stack>
      <StatusBar style="auto" />
      <PortalHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootLayoutContent />
    </AppProviders>
  );
}
