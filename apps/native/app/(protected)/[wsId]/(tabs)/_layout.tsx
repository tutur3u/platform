import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function TabBarIcon({
  name,
  color,
}: {
  name: IconName;
  color: string;
  focused: boolean;
}) {
  return <Ionicons name={name} size={24} color={color} />;
}

/**
 * Main tab navigation for workspace
 *
 * Provides bottom tabs for:
 * - Home (Dashboard)
 * - Tasks
 * - Calendar
 * - Finance
 * - Time Tracker
 * - Settings
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor:
            colorScheme === 'dark'
              ? Colors.dark.background
              : Colors.light.background,
          borderTopColor: colorScheme === 'dark' ? '#27272a' : '#e4e4e7',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'home' : 'home-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'checkbox' : 'checkbox-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'calendar' : 'calendar-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'wallet' : 'wallet-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="time-tracker"
        options={{
          title: 'Timer',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'timer' : 'timer-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'settings' : 'settings-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
