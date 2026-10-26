// Notifications written by background jobs store English text. Codes listed
// here are rendered from the viewer's message bundle instead, falling back to
// the stored text when an app does not ship the keys.
export const LOCALIZED_NOTIFICATION_CODES = [
  'calendar_reconnect_required',
  'tutoring_session_completed',
] as const;

export type NotificationCodeText = Partial<
  Record<string, { title: string; description?: string }>
>;

export function notificationDisplayText(
  notification: {
    code?: string | null;
    title: string;
    description: string | null;
  },
  codeText?: NotificationCodeText
) {
  const localized = notification.code
    ? codeText?.[notification.code]
    : undefined;
  return {
    title: localized?.title ?? notification.title,
    description: localized?.description ?? notification.description,
  };
}
