export const accountNotificationPreferencesQueryKey = [
  'account-notification-preferences',
] as const;

export function workspaceNotificationPreferencesQueryKey(workspaceId: string) {
  return ['notification-preferences', workspaceId] as const;
}
