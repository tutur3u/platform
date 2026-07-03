export interface NotificationPreferenceWrite {
  eventType: string;
  channel: string;
  enabled: boolean;
}

interface NotificationPreferenceRow {
  ws_id: string | null;
  user_id: string;
  event_type: string;
  channel: string;
  enabled: boolean;
  scope: 'user' | 'workspace';
}

interface NotificationPreferenceError {
  code?: string;
  message: string;
}

interface NotificationPreferenceQuery {
  eq(field: string, value: unknown): NotificationPreferenceQuery;
  is(field: string, value: unknown): NotificationPreferenceQuery;
  maybeSingle(): PromiseLike<{
    data: null | { id: string };
    error: null | NotificationPreferenceError;
  }>;
  select(columns: string): NotificationPreferenceQuery;
}

interface NotificationPreferenceTable {
  insert(
    row: NotificationPreferenceRow
  ): PromiseLike<{ error: null | NotificationPreferenceError }>;
  update(payload: { enabled: boolean }): NotificationPreferenceQuery;
}

interface NotificationPreferenceAdminClient {
  from(table: 'notification_preferences'): NotificationPreferenceTable;
}

interface SaveNotificationPreferencesOptions {
  preferences: NotificationPreferenceWrite[];
  scope: 'user' | 'workspace';
  supabaseAdmin: unknown;
  userId: string;
  wsId: string | null;
}

function dedupePreferences(preferences: NotificationPreferenceWrite[]) {
  const uniquePreferences = preferences.reduce((acc, preference) => {
    const key = `${preference.eventType}-${preference.channel}`;
    if (!acc.has(key)) {
      acc.set(key, preference);
    }
    return acc;
  }, new Map<string, NotificationPreferenceWrite>());

  return Array.from(uniquePreferences.values());
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === '23505';
}

async function updateNotificationPreference({
  preference,
  scope,
  supabaseAdmin,
  userId,
  wsId,
}: Omit<SaveNotificationPreferencesOptions, 'preferences'> & {
  preference: NotificationPreferenceWrite;
}) {
  const admin = supabaseAdmin as NotificationPreferenceAdminClient;
  const updateQuery = admin
    .from('notification_preferences')
    .update({ enabled: preference.enabled })
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('event_type', preference.eventType)
    .eq('channel', preference.channel);

  const scopedUpdateQuery = wsId
    ? updateQuery.eq('ws_id', wsId)
    : updateQuery.is('ws_id', null);

  return scopedUpdateQuery.select('id').maybeSingle();
}

async function insertNotificationPreference({
  preference,
  scope,
  supabaseAdmin,
  userId,
  wsId,
}: Omit<SaveNotificationPreferencesOptions, 'preferences'> & {
  preference: NotificationPreferenceWrite;
}) {
  const admin = supabaseAdmin as NotificationPreferenceAdminClient;

  return admin.from('notification_preferences').insert({
    ws_id: wsId,
    user_id: userId,
    event_type: preference.eventType,
    channel: preference.channel,
    enabled: preference.enabled,
    scope,
  });
}

export async function saveNotificationPreferences({
  preferences,
  scope,
  supabaseAdmin,
  userId,
  wsId,
}: SaveNotificationPreferencesOptions) {
  for (const preference of dedupePreferences(preferences)) {
    const updateResult = await updateNotificationPreference({
      preference,
      scope,
      supabaseAdmin,
      userId,
      wsId,
    });

    if (updateResult.error) {
      return updateResult.error;
    }

    if (updateResult.data) {
      continue;
    }

    const insertResult = await insertNotificationPreference({
      preference,
      scope,
      supabaseAdmin,
      userId,
      wsId,
    });

    if (!insertResult.error) {
      continue;
    }

    if (isUniqueViolation(insertResult.error)) {
      const retryResult = await updateNotificationPreference({
        preference,
        scope,
        supabaseAdmin,
        userId,
        wsId,
      });

      if (!retryResult.error && retryResult.data) {
        continue;
      }

      return retryResult.error ?? insertResult.error;
    }

    return insertResult.error;
  }

  return null;
}
