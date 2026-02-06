import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsAuthenticated } from '@/lib/stores';

const FEATURES = [
  {
    id: 'finance',
    title: 'Finance',
    description: 'Track expenses, manage budgets, and gain financial insights',
    icon: '💰',
    color: 'bg-emerald-500/10',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'Schedule events, set reminders, and stay organized',
    icon: '📅',
    color: 'bg-blue-500/10',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    description: 'Kanban boards, checklists, and productivity tools',
    icon: '✓',
    color: 'bg-purple-500/10',
    textColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    id: 'ai',
    title: 'AI Assistant',
    description: 'Powered by advanced AI to help you work smarter',
    icon: '✨',
    color: 'bg-amber-500/10',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
] as const;

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200 + index * 100).springify()}
      className="mb-4"
    >
      <View
        className={`rounded-2xl p-5 ${feature.color} border border-border/50`}
      >
        <View className="mb-2 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-background">
            <Text className="text-xl">{feature.icon}</Text>
          </View>
          <Text className={`font-semibold text-lg ${feature.textColor}`}>
            {feature.title}
          </Text>
        </View>
        <Text className="text-muted-foreground text-sm leading-5">
          {feature.description}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useIsAuthenticated();

  // Redirect authenticated users to workspace selection
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(protected)/workspace-select');
    }
  }, [isAuthenticated]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Section */}
      <Animated.View
        entering={FadeInUp.springify()}
        className="mb-8 items-center"
      >
        <Image
          source={require('@/assets/images/icon.png')}
          style={{ width: 80, height: 80 }}
          className="mb-4 rounded-2xl"
        />
        <Text className="text-center font-bold text-3xl text-foreground">
          Welcome to Tuturuuu
        </Text>
        <Text className="mt-2 text-center text-base text-muted-foreground">
          Your all-in-one productivity platform
        </Text>
      </Animated.View>

      {/* Quick Actions */}
      <Animated.View
        entering={FadeInDown.delay(100).springify()}
        className="mb-8 flex-row gap-3"
      >
        <Link href="/(auth)/login" asChild>
          <Pressable className="flex-1 items-center rounded-xl bg-blue-600 p-4 active:bg-blue-700">
            <Text className="font-semibold text-white">Sign In</Text>
          </Pressable>
        </Link>
        <Link href="/(auth)/signup" asChild>
          <Pressable className="flex-1 items-center rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
            <Text className="font-semibold text-zinc-900 dark:text-white">
              Sign Up
            </Text>
          </Pressable>
        </Link>
      </Animated.View>

      {/* Features Section */}
      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text className="mb-4 font-bold text-foreground text-xl">Features</Text>
      </Animated.View>

      {FEATURES.map((feature, index) => (
        <FeatureCard key={feature.id} feature={feature} index={index} />
      ))}

      {/* Footer */}
      <Animated.View
        entering={FadeInDown.delay(600).springify()}
        className="mt-4 items-center"
      >
        <Text className="text-muted-foreground text-sm">
          Built with ❤️ by Tuturuuu Team
        </Text>
      </Animated.View>
    </ScrollView>
  );
}
