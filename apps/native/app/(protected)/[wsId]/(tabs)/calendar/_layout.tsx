import { Stack } from 'expo-router';

export default function CalendarLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Calendar',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[eventId]"
        options={{
          title: 'Event Details',
          headerBackTitle: 'Calendar',
        }}
      />
    </Stack>
  );
}
