import { Stack } from 'expo-router';

export default function TimeTrackerLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Time Tracker',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="history"
        options={{
          title: 'Session History',
          headerBackTitle: 'Timer',
        }}
      />
    </Stack>
  );
}
