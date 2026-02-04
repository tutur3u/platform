import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage adapter for Supabase auth using device secure storage
 *
 * - iOS: Keychain Services
 * - Android: Keystore
 * - Web: localStorage fallback
 *
 * This provides much better security than AsyncStorage for auth tokens,
 * as the data is encrypted at the OS level and can be protected by
 * biometric authentication.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Key doesn't exist or other error
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Key might not exist
    }
  },
};

/**
 * Storage keys used by the app
 */
export const STORAGE_KEYS = {
  SUPABASE_AUTH: 'supabase-auth-token',
  SELECTED_WORKSPACE: 'selected-workspace-id',
  USER_PREFERENCES: 'user-preferences',
} as const;
