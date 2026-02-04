import { Image } from 'expo-image';

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
import { useAuthStore } from '@/lib/stores';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { user, refreshSession } = useAuthStore();

  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.display_name ?? ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleDisplayNameChange = (text: string) => {
    setDisplayName(text);
    setHasChanges(text !== (user?.user_metadata?.display_name ?? ''));
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName },
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      await refreshSession();
      setHasChanges(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update profile'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const avatarUrl = user?.user_metadata?.avatar_url;

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
          {/* Avatar Section */}
          <View className="mb-8 items-center">
            <View className="mb-4 h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 96, height: 96 }}
                  contentFit="cover"
                />
              ) : (
                <Text className="font-bold text-4xl text-zinc-400 dark:text-zinc-500">
                  {displayName?.charAt(0)?.toUpperCase() ??
                    user?.email?.charAt(0)?.toUpperCase() ??
                    'U'}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                // TODO: Implement avatar upload
                Alert.alert(
                  'Coming Soon',
                  'Avatar upload will be available in a future update.'
                );
              }}
              className="rounded-lg bg-zinc-200 px-4 py-2 active:bg-zinc-300 dark:bg-zinc-700 dark:active:bg-zinc-600"
            >
              <Text className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
                Change Photo
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <View className="rounded-xl bg-white shadow-sm dark:bg-zinc-800">
            {/* Display Name */}
            <View className="border-zinc-100 border-b p-4 dark:border-zinc-700">
              <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                Display Name
              </Text>
              <TextInput
                value={displayName}
                onChangeText={handleDisplayNameChange}
                placeholder="Enter your display name"
                placeholderTextColor="#9ca3af"
                className="text-base text-zinc-900 dark:text-white"
              />
            </View>

            {/* Email (Read-only) */}
            <View className="p-4">
              <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                Email
              </Text>
              <Text className="text-base text-zinc-900 dark:text-white">
                {user?.email ?? 'Not available'}
              </Text>
              <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Email cannot be changed from the mobile app
              </Text>
            </View>
          </View>

          {/* Account Info */}
          <View className="mt-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
            <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
              Account Created
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Unknown'}
            </Text>
          </View>

          {/* Auth Provider */}
          {user?.app_metadata?.provider && (
            <View className="mt-6 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
              <Text className="mb-2 font-medium text-sm text-zinc-500 dark:text-zinc-400">
                Sign-in Method
              </Text>
              <Text className="text-base text-zinc-900 capitalize dark:text-white">
                {user.app_metadata.provider === 'email'
                  ? 'Email & Password'
                  : user.app_metadata.provider}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Save Button */}
        {hasChanges && (
          <View className="border-zinc-200 border-t p-4 dark:border-zinc-800">
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              className={`rounded-xl py-4 ${
                isSaving ? 'bg-blue-400' : 'bg-blue-600 active:bg-blue-700'
              }`}
            >
              {isSaving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-center font-semibold text-white">
                  Save Changes
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
