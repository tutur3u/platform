import { Stack } from 'expo-router';

export default function TasksLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tasks',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[taskId]"
        options={{
          title: 'Task Details',
          headerBackTitle: 'Tasks',
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'New Task',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
