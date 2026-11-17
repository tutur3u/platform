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

/** Code text for the codes an app bundle translates; others keep stored text. */
export function notificationCodeTextFrom(t: {
  (key: any): string;
  has(key: any): boolean;
}): NotificationCodeText {
  return Object.fromEntries(
    LOCALIZED_NOTIFICATION_CODES.filter((code) =>
      t.has(`notifications.codes.${code}.title`)
    ).map((code) => [
      code,
      {
        title: t(`notifications.codes.${code}.title`),
        description: t(`notifications.codes.${code}.description`),
      },
    ])
  );
}
