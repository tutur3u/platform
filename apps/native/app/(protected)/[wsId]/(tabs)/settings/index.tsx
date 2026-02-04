import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useVersionCheck } from '@/hooks/use-version-check';
import { useAuthStore, useUIStore } from '@/lib/stores';

type IconName = ComponentProps<typeof Ionicons>['name'];

type SettingsItem = {
  label: string;
  icon: IconName;
  type: 'link' | 'toggle' | 'action';
  href?: string;
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  description?: string;
};

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const { user, signOut } = useAuthStore();
  const { themeMode, setThemeMode } = useUIStore();
  const { currentVersion, isUpdateAvailable, openStore } = useVersionCheck();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const sections: SettingsSection[] = [
    {
      title: 'Account',
      items: [
        {
          label: 'Profile',
          icon: 'person-outline',
          type: 'link',
          href: 'settings/profile',
          description: user?.email ?? 'Manage your profile',
        },
        {
          label: 'Switch Workspace',
          icon: 'swap-horizontal-outline',
          type: 'action',
          onPress: () => router.push('/(protected)/workspace-select'),
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          label: 'Dark Mode',
          icon: 'moon-outline',
          type: 'toggle',
          value: themeMode === 'dark',
          onToggle: (value) => setThemeMode(value ? 'dark' : 'light'),
        },
        {
          label: 'Use System Theme',
          icon: 'phone-portrait-outline',
          type: 'toggle',
          value: themeMode === 'system',
          onToggle: (value) =>
            setThemeMode(value ? 'system' : (colorScheme ?? 'light')),
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          label: 'Version',
          icon: 'information-circle-outline',
          type: 'action',
          description: `v${currentVersion}${isUpdateAvailable ? ' (Update available)' : ''}`,
          onPress: isUpdateAvailable ? openStore : undefined,
        },
        {
          label: 'Help & Support',
          icon: 'help-circle-outline',
          type: 'action',
          onPress: () => {
            // TODO: Open help/support URL
          },
        },
      ],
    },
  ];

  const renderItem = (item: SettingsItem, index: number, total: number) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    const content = (
      <View
        className={`flex-row items-center bg-white px-4 py-4 dark:bg-zinc-800 ${
          isFirst ? 'rounded-t-xl' : ''
        } ${isLast ? 'rounded-b-xl' : 'border-zinc-100 border-b dark:border-zinc-700'}`}
      >
        <View className="mr-4 h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700">
          <Ionicons
            name={item.icon}
            size={20}
            color={colorScheme === 'dark' ? '#a1a1aa' : '#52525b'}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base text-zinc-900 dark:text-white">
            {item.label}
          </Text>
          {item.description && (
            <Text className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {item.description}
            </Text>
          )}
        </View>
        {item.type === 'toggle' && (
          <Switch
            value={item.value}
            onValueChange={item.onToggle}
            trackColor={{ false: '#d4d4d8', true: '#3b82f6' }}
            thumbColor="#ffffff"
          />
        )}
        {item.type === 'link' && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
          />
        )}
      </View>
    );

    if (item.type === 'link' && item.href) {
      return (
        <Link key={item.label} href={item.href as any} asChild>
          <Pressable className="active:opacity-70">{content}</Pressable>
        </Link>
      );
    }

    if (item.type === 'action' && item.onPress) {
      return (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          className="active:opacity-70"
        >
          {content}
        </Pressable>
      );
    }

    return <View key={item.label}>{content}</View>;
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-100 dark:bg-zinc-900">
      <ScrollView contentContainerClassName="p-6">
        {/* Header */}
        <Text className="mb-6 font-bold text-2xl text-zinc-900 dark:text-white">
          Settings
        </Text>

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.title} className="mb-6">
            <Text className="mb-2 px-4 font-medium text-sm text-zinc-500 uppercase dark:text-zinc-400">
              {section.title}
            </Text>
            <View className="overflow-hidden rounded-xl shadow-sm">
              {section.items.map((item, index) =>
                renderItem(item, index, section.items.length)
              )}
            </View>
          </View>
        ))}

        {/* Sign Out Button */}
        <Pressable
          onPress={handleSignOut}
          className="mt-4 rounded-xl bg-white py-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700"
        >
          <Text className="text-center font-medium text-red-500">Sign Out</Text>
        </Pressable>

        {/* Version Footer */}
        <Text className="mt-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          Tuturuuu v{currentVersion}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
