import type { Workspace } from '@tuturuuu/types';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore, useWorkspaceStore } from '@/lib/stores';

export default function WorkspaceSelectScreen() {
  const { user, signOut } = useAuthStore();
  const {
    workspaces,
    currentWorkspace,
    isLoading,
    error,
    fetchWorkspaces,
    selectWorkspace,
  } = useWorkspaceStore();

  // Fetch workspaces on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Auto-navigate if workspace already selected
  useEffect(() => {
    if (currentWorkspace) {
      router.replace(`/(protected)/${currentWorkspace.id}/(tabs)`);
    }
  }, [currentWorkspace]);

  const handleSelectWorkspace = (workspace: Workspace) => {
    selectWorkspace(workspace);
    router.replace(`/(protected)/${workspace.id}/(tabs)`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const renderWorkspaceItem = ({ item }: { item: Workspace }) => (
    <Pressable
      onPress={() => handleSelectWorkspace(item)}
      className="mb-3 flex-row items-center rounded-xl border border-zinc-200 bg-white p-4 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:active:bg-zinc-700"
    >
      {/* Workspace Avatar */}
      <View className="mr-4 h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-700">
        {item.avatar_url ? (
          <Image
            source={{ uri: item.avatar_url }}
            style={{ width: 48, height: 48 }}
            contentFit="cover"
          />
        ) : (
          <Text className="font-bold text-xl text-zinc-500 dark:text-zinc-400">
            {item.name?.charAt(0)?.toUpperCase() ?? 'W'}
          </Text>
        )}
      </View>

      {/* Workspace Info */}
      <View className="flex-1">
        <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
          {item.name ?? 'Unnamed Workspace'}
        </Text>
        {item.handle && (
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            @{item.handle}
          </Text>
        )}
        {item.personal && (
          <View className="mt-1 self-start rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-900/30">
            <Text className="text-blue-700 text-xs dark:text-blue-400">
              Personal
            </Text>
          </View>
        )}
      </View>

      {/* Arrow */}
      <Text className="text-xl text-zinc-400 dark:text-zinc-500">{'>'}</Text>
    </Pressable>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="mb-2 text-6xl">{'( )'}</Text>
      <Text className="mb-2 font-semibold text-xl text-zinc-900 dark:text-white">
        No workspaces found
      </Text>
      <Text className="text-center text-zinc-500 dark:text-zinc-400">
        You don&apos;t have access to any workspaces yet. Create one on the web
        or ask to be invited.
      </Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <View className="border-zinc-200 border-b px-6 py-4 dark:border-zinc-800">
        <Text className="font-bold text-2xl text-zinc-900 dark:text-white">
          Select Workspace
        </Text>
        <Text className="mt-1 text-zinc-500 dark:text-zinc-400">
          Welcome back, {user?.email}
        </Text>
      </View>

      {/* Error State */}
      {error && (
        <View className="mx-6 mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">{error}</Text>
          <Pressable
            onPress={() => fetchWorkspaces()}
            className="mt-2 self-start"
          >
            <Text className="font-medium text-red-700 dark:text-red-300">
              Try again
            </Text>
          </Pressable>
        </View>
      )}

      {/* Workspace List */}
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkspaceItem}
        contentContainerClassName="p-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={fetchWorkspaces} />
        }
      />

      {/* Loading Overlay */}
      {isLoading && workspaces.length === 0 && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-50/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text className="mt-4 text-zinc-500 dark:text-zinc-400">
            Loading workspaces...
          </Text>
        </View>
      )}

      {/* Sign Out Button */}
      <View className="border-zinc-200 border-t p-6 dark:border-zinc-800">
        <Pressable
          onPress={handleSignOut}
          className="rounded-lg border border-zinc-300 py-3 active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-800"
        >
          <Text className="text-center font-medium text-zinc-700 dark:text-zinc-300">
            Sign Out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
