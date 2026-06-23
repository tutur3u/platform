import type { SupabaseClient } from '@tuturuuu/supabase';
import {
  type CalendarSourceOption,
  listCalendarSourceOptions,
  type ResolvedCalendarSource,
  resolveCalendarSource,
} from './source-resolver';

export type CalendarConflictPolicy = 'latest_write_wins';

export type CalendarSyncPreferencesResponse = {
  inboundSyncEnabled: boolean;
  outboundSyncEnabled: boolean;
  conflictPolicy: CalendarConflictPolicy;
  defaultOutboundConnectionId: string | null;
  options: CalendarSourceOption[];
  settingsAvailable: boolean;
};

export type CalendarSyncPreferencesPayload = {
  inboundSyncEnabled?: boolean;
  outboundSyncEnabled?: boolean;
  conflictPolicy?: CalendarConflictPolicy;
  defaultOutboundConnectionId?: string | null;
};

type PreferenceRow = {
  inbound_sync_enabled: boolean | null;
  outbound_sync_enabled: boolean | null;
  conflict_policy: string | null;
  default_outbound_calendar_connection_id: string | null;
};

const DEFAULT_SYNC_PREFERENCES = {
  inboundSyncEnabled: true,
  outboundSyncEnabled: false,
  conflictPolicy: 'latest_write_wins' as const,
  defaultOutboundConnectionId: null,
};

export function isMissingCalendarSyncSchemaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? String(error.code) : '';
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'CALENDAR_SYNC_SCHEMA_MISSING' ||
    message.includes('inbound_sync_enabled') ||
    message.includes('outbound_sync_enabled') ||
    message.includes('conflict_policy') ||
    message.includes('default_outbound_calendar_connection_id') ||
    message.includes('sync_outbound_enabled')
  );
}

function normalizePreferenceRow(row: PreferenceRow | null) {
  if (!row) return DEFAULT_SYNC_PREFERENCES;

  return {
    inboundSyncEnabled:
      row.inbound_sync_enabled ?? DEFAULT_SYNC_PREFERENCES.inboundSyncEnabled,
    outboundSyncEnabled:
      row.outbound_sync_enabled ?? DEFAULT_SYNC_PREFERENCES.outboundSyncEnabled,
    conflictPolicy:
      row.conflict_policy === 'latest_write_wins'
        ? row.conflict_policy
        : DEFAULT_SYNC_PREFERENCES.conflictPolicy,
    defaultOutboundConnectionId:
      row.default_outbound_calendar_connection_id ??
      DEFAULT_SYNC_PREFERENCES.defaultOutboundConnectionId,
  };
}

async function getPreferenceRow(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}) {
  const { data, error } = await (args.sbAdmin as any)
    .schema('private')
    .from('calendar_user_workspace_preferences')
    .select(
      'inbound_sync_enabled, outbound_sync_enabled, conflict_policy, default_outbound_calendar_connection_id'
    )
    .eq('ws_id', args.wsId)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error) throw error;
  return data as PreferenceRow | null;
}

export async function getCalendarSyncPreferences(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}): Promise<CalendarSyncPreferencesResponse> {
  const options = await listCalendarSourceOptions(args);

  try {
    const row = await getPreferenceRow(args);

    return {
      ...normalizePreferenceRow(row),
      options,
      settingsAvailable: true,
    };
  } catch (error) {
    if (!isMissingCalendarSyncSchemaError(error)) throw error;

    return {
      ...DEFAULT_SYNC_PREFERENCES,
      options,
      settingsAvailable: false,
    };
  }
}

export async function saveCalendarSyncPreferences(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
  preferences: CalendarSyncPreferencesPayload;
}): Promise<CalendarSyncPreferencesResponse> {
  const current = await getCalendarSyncPreferences(args);
  if (!current.settingsAvailable) {
    const error = new Error(
      'Calendar sync settings are unavailable until the latest database migration is applied'
    );
    (error as Error & { code?: string }).code = 'CALENDAR_SYNC_SCHEMA_MISSING';
    throw error;
  }

  const defaultOutboundConnectionId =
    args.preferences.defaultOutboundConnectionId === undefined
      ? current.defaultOutboundConnectionId
      : args.preferences.defaultOutboundConnectionId;

  if (defaultOutboundConnectionId) {
    const option = current.options.find(
      (candidate) =>
        candidate.provider !== 'tuturuuu' &&
        candidate.connectionId === defaultOutboundConnectionId
    );

    if (!option) {
      throw new Error('Default outbound calendar is unavailable or read-only');
    }
  }

  const payload = {
    user_id: args.userId,
    ws_id: args.wsId,
    inbound_sync_enabled:
      args.preferences.inboundSyncEnabled ?? current.inboundSyncEnabled,
    outbound_sync_enabled:
      args.preferences.outboundSyncEnabled ?? current.outboundSyncEnabled,
    conflict_policy: args.preferences.conflictPolicy ?? current.conflictPolicy,
    default_outbound_calendar_connection_id: defaultOutboundConnectionId,
  };

  const { error } = await (args.sbAdmin as any)
    .schema('private')
    .from('calendar_user_workspace_preferences')
    .upsert(payload, { onConflict: 'user_id,ws_id' });

  if (error) throw error;
  return getCalendarSyncPreferences(args);
}

export async function resolveOutboundSyncSource(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}): Promise<ResolvedCalendarSource | null> {
  const preferences = await getCalendarSyncPreferences(args);
  if (
    !preferences.settingsAvailable ||
    !preferences.outboundSyncEnabled ||
    !preferences.defaultOutboundConnectionId
  ) {
    return null;
  }

  try {
    const { data, error } = await (args.sbAdmin as any)
      .from('calendar_connections')
      .select('provider, is_enabled, sync_outbound_enabled')
      .eq('id', preferences.defaultOutboundConnectionId)
      .eq('ws_id', args.wsId)
      .maybeSingle();

    if (error) throw error;
    if (
      !data?.is_enabled ||
      data.sync_outbound_enabled !== true ||
      (data.provider !== 'google' && data.provider !== 'microsoft')
    ) {
      return null;
    }

    return resolveCalendarSource({
      ...args,
      source: {
        provider: data.provider,
        connectionId: preferences.defaultOutboundConnectionId,
      },
    });
  } catch (error) {
    if (isMissingCalendarSyncSchemaError(error)) return null;
    throw error;
  }
}
