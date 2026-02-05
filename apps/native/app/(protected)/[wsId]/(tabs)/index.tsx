import { Image } from 'expo-image';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore, useCurrentWorkspace, useWorkspaces } from '@/lib/stores';

type QuickActionItem = {
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
};

const quickActions: QuickActionItem[] = [
  {
    title: 'Tasks',
    description: 'View and manage tasks',
    href: 'tasks',
    icon: 'checkbox',
    color: 'bg-blue-500',
  },
  {
    title: 'Calendar',
    description: 'Check your schedule',
    href: 'calendar',
    icon: 'calendar',
    color: 'bg-green-500',
  },
  {
    title: 'Finance',
    description: 'Track expenses',
    href: 'finance',
    icon: 'wallet',
    color: 'bg-purple-500',
  },
  {
    title: 'Time Tracker',
    description: 'Start a timer',
    href: 'time-tracker',
    icon: 'timer',
    color: 'bg-orange-500',
  },
];

export default function DashboardScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { user } = useAuthStore();
  const workspace = useCurrentWorkspace();
  const { data: workspaces } = useWorkspaces();

  const greeting = getGreeting();

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-900">
      <ScrollView contentContainerClassName="p-6">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {greeting}
          </Text>
          <Text className="mt-1 font-bold text-2xl text-zinc-900 dark:text-white">
            {user?.user_metadata?.display_name ?? user?.email ?? 'User'}
          </Text>
        </View>

        {/* Workspace Info Card */}
        <View className="mb-6 rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-800">
          <View className="flex-row items-center">
            <View className="mr-4 h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-700">
              {workspace?.avatar_url ? (
                <Image
                  source={{ uri: workspace.avatar_url }}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                />
              ) : (
                <Text className="font-bold text-2xl text-zinc-500 dark:text-zinc-400">
                  {workspace?.name?.charAt(0)?.toUpperCase() ?? 'W'}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
                {workspace?.name ?? 'Workspace'}
              </Text>
              {workspace?.handle && (
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  @{workspace.handle}
                </Text>
              )}
            </View>
            {(workspaces?.length ?? 0) > 1 && (
              <Link href="/(protected)/workspace-select" asChild>
                <Pressable className="rounded-lg border border-zinc-200 px-3 py-2 active:bg-zinc-50 dark:border-zinc-700 dark:active:bg-zinc-700">
                  <Text className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
                    Switch
                  </Text>
                </Pressable>
              </Link>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <Text className="mb-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Quick Actions
        </Text>
        <View className="mb-6 flex-row flex-wrap">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={`/(protected)/${wsId}/(tabs)/${action.href}`}
              asChild
            >
              <Pressable className="mb-4 w-1/2 pr-2">
                <View className="rounded-xl bg-white p-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
                  <View
                    className={`mb-3 h-10 w-10 items-center justify-center rounded-lg ${action.color}`}
                  >
                    <Text className="text-lg text-white">
                      {getIcon(action.icon)}
                    </Text>
                  </View>
                  <Text className="font-semibold text-zinc-900 dark:text-white">
                    {action.title}
                  </Text>
                  <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {action.description}
                  </Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>

        {/* Recent Activity Placeholder */}
        <Text className="mb-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Recent Activity
        </Text>
        <View className="rounded-xl bg-white p-6 dark:bg-zinc-800">
          <View className="items-center py-8">
            <Text className="text-4xl opacity-30">{'- -'}</Text>
            <Text className="mt-4 text-zinc-500 dark:text-zinc-400">
              No recent activity
            </Text>
            <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Your recent tasks and events will appear here
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    checkbox: '[x]',
    calendar: '[=]',
    wallet: '[$]',
    timer: '[o]',
  };
  return icons[name] ?? '[?]';
}
