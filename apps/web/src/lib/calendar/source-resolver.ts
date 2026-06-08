import type { SupabaseClient } from '@tuturuuu/supabase';

export type CalendarSourceProvider = 'tuturuuu' | 'google' | 'microsoft';

export type CalendarSourceInput =
  | {
      provider: 'tuturuuu';
      workspaceCalendarId?: string | null;
    }
  | {
      provider: 'google' | 'microsoft';
      connectionId: string;
    };

export type CalendarSourceValue =
  | {
      provider: 'tuturuuu';
      workspaceCalendarId: string;
    }
  | {
      provider: 'google' | 'microsoft';
      connectionId: string;
      workspaceCalendarId: string | null;
      externalCalendarId: string;
      accessRole: string | null;
      accountEmail: string | null;
      accountName: string | null;
    };

export type CalendarSourceOption = CalendarSourceValue & {
  id: string;
  label: string;
  color: string | null;
  primary?: boolean;
  writable: boolean;
};

export type ResolvedCalendarSource = CalendarSourceValue & {
  label: string;
  color: string | null;
  accessToken?: string;
  refreshToken?: string | null;
};

type CalendarConnectionRow = {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  color: string | null;
  is_enabled: boolean;
  provider: CalendarSourceProvider;
  auth_token_id: string | null;
  workspace_calendar_id: string | null;
  access_role: string | null;
};

type CalendarTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  user_id: string;
  ws_id: string;
  provider: 'google' | 'microsoft';
  account_email: string | null;
  account_name: string | null;
  is_active: boolean;
};

type WorkspaceCalendarRow = {
  id: string;
  name: string;
  color: string | null;
  calendar_type: string;
  is_enabled: boolean;
};

function sourceId(source: CalendarSourceValue) {
  if (source.provider === 'tuturuuu') {
    return `tuturuuu:${source.workspaceCalendarId}`;
  }

  return `${source.provider}:${source.connectionId}`;
}

export function isWritableCalendarAccess(accessRole?: string | null) {
  if (!accessRole) return true;

  return ['owner', 'writer', 'write', 'editor'].includes(
    accessRole.toLowerCase()
  );
}

async function getPrimaryWorkspaceCalendar(
  sbAdmin: SupabaseClient,
  wsId: string
) {
  const { data, error } = await (sbAdmin as any)
    .schema('private')
    .from('workspace_calendars')
    .select('id, name, color, calendar_type, is_enabled')
    .eq('ws_id', wsId)
    .eq('calendar_type', 'primary')
    .maybeSingle();

  if (error) throw error;
  return data as WorkspaceCalendarRow | null;
}

async function getWorkspaceCalendars(sbAdmin: SupabaseClient, wsId: string) {
  const { data, error } = await (sbAdmin as any)
    .schema('private')
    .from('workspace_calendars')
    .select('id, name, color, calendar_type, is_enabled')
    .eq('ws_id', wsId)
    .eq('is_enabled', true)
    .order('is_system', { ascending: false })
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkspaceCalendarRow[];
}

async function getPreference(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}) {
  const { data, error } = await (args.sbAdmin as any)
    .schema('private')
    .from('calendar_user_workspace_preferences')
    .select(
      'default_provider, default_workspace_calendar_id, default_calendar_connection_id'
    )
    .eq('ws_id', args.wsId)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error) throw error;
  return data as {
    default_provider: CalendarSourceProvider;
    default_workspace_calendar_id: string | null;
    default_calendar_connection_id: string | null;
  } | null;
}

async function listWritableConnections(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}) {
  const { data: tokenRows, error: tokenError } = await (args.sbAdmin as any)
    .from('calendar_auth_tokens')
    .select(
      'id, access_token, refresh_token, user_id, ws_id, provider, account_email, account_name, is_active'
    )
    .eq('ws_id', args.wsId)
    .eq('user_id', args.userId)
    .eq('is_active', true)
    .in('provider', ['google', 'microsoft']);

  if (tokenError) throw tokenError;

  const tokens = (tokenRows ?? []) as CalendarTokenRow[];
  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  if (tokens.length === 0) return [];

  const { data: connectionRows, error: connectionError } = await (
    args.sbAdmin as any
  )
    .from('calendar_connections')
    .select(
      'id, ws_id, calendar_id, calendar_name, color, is_enabled, provider, auth_token_id, workspace_calendar_id, access_role'
    )
    .eq('ws_id', args.wsId)
    .eq('is_enabled', true)
    .in(
      'auth_token_id',
      tokens.map((token) => token.id)
    )
    .order('created_at', { ascending: true });

  if (connectionError) throw connectionError;

  return ((connectionRows ?? []) as CalendarConnectionRow[])
    .map((connection) => ({
      connection,
      token: connection.auth_token_id
        ? tokenById.get(connection.auth_token_id)
        : undefined,
    }))
    .filter(
      (
        entry
      ): entry is {
        connection: CalendarConnectionRow;
        token: CalendarTokenRow;
      } =>
        !!entry.token &&
        entry.connection.provider === entry.token.provider &&
        isWritableCalendarAccess(entry.connection.access_role)
    );
}

export async function listCalendarSourceOptions(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}) {
  const [workspaceCalendars, connectionEntries] = await Promise.all([
    getWorkspaceCalendars(args.sbAdmin, args.wsId),
    listWritableConnections(args),
  ]);

  const nativeOptions: CalendarSourceOption[] = workspaceCalendars.map(
    (calendar) => ({
      id: `tuturuuu:${calendar.id}`,
      provider: 'tuturuuu',
      workspaceCalendarId: calendar.id,
      label:
        calendar.calendar_type === 'primary'
          ? 'Tuturuuu Primary'
          : calendar.name,
      color: calendar.color,
      primary: calendar.calendar_type === 'primary',
      writable: true,
    })
  );

  const externalOptions: CalendarSourceOption[] = connectionEntries.map(
    ({ connection, token }) => ({
      id: `${connection.provider}:${connection.id}`,
      provider: connection.provider as 'google' | 'microsoft',
      connectionId: connection.id,
      workspaceCalendarId: connection.workspace_calendar_id,
      externalCalendarId: connection.calendar_id,
      accessRole: connection.access_role,
      accountEmail: token.account_email,
      accountName: token.account_name,
      label: connection.calendar_name,
      color: connection.color,
      writable: true,
    })
  );

  return [...nativeOptions, ...externalOptions];
}

export async function resolveCalendarSource(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
  source?: CalendarSourceInput | null;
}) {
  const options = await listCalendarSourceOptions(args);

  let selectedSource = args.source;
  if (!selectedSource) {
    const preference = await getPreference(args);
    if (preference?.default_provider === 'tuturuuu') {
      selectedSource = {
        provider: 'tuturuuu',
        workspaceCalendarId: preference.default_workspace_calendar_id,
      };
    } else if (
      preference?.default_provider === 'google' ||
      preference?.default_provider === 'microsoft'
    ) {
      selectedSource = {
        provider: preference.default_provider,
        connectionId: preference.default_calendar_connection_id ?? '',
      };
    }
  }

  let option: CalendarSourceOption | undefined;
  if (selectedSource?.provider === 'tuturuuu') {
    option = options.find(
      (candidate) =>
        candidate.provider === 'tuturuuu' &&
        (!selectedSource.workspaceCalendarId ||
          candidate.workspaceCalendarId === selectedSource.workspaceCalendarId)
    );
  } else if (selectedSource?.provider) {
    option = options.find((candidate) => {
      if (candidate.provider === 'tuturuuu') return false;

      return (
        candidate.provider === selectedSource.provider &&
        candidate.connectionId === selectedSource.connectionId
      );
    });
  }

  if (!option) {
    const fallback = options.find(
      (candidate) => candidate.provider === 'tuturuuu' && candidate.primary
    );

    if (selectedSource) {
      throw new Error('Selected calendar source is unavailable or read-only');
    }

    if (!fallback) {
      const primary = await getPrimaryWorkspaceCalendar(
        args.sbAdmin,
        args.wsId
      );
      if (!primary) {
        throw new Error('Workspace primary calendar is unavailable');
      }

      return {
        provider: 'tuturuuu',
        workspaceCalendarId: primary.id,
        label: primary.name,
        color: primary.color,
      } satisfies ResolvedCalendarSource;
    }

    option = fallback;
  }

  if (option.provider === 'tuturuuu') {
    return {
      provider: 'tuturuuu',
      workspaceCalendarId: option.workspaceCalendarId,
      label: option.label,
      color: option.color,
    } satisfies ResolvedCalendarSource;
  }

  const entries = await listWritableConnections(args);
  const entry = entries.find(
    ({ connection }) => connection.id === option.id.split(':')[1]
  );
  if (!entry) {
    throw new Error('Selected calendar source is unavailable or read-only');
  }

  return {
    provider: option.provider,
    connectionId: option.connectionId,
    workspaceCalendarId: option.workspaceCalendarId,
    externalCalendarId: option.externalCalendarId,
    accessRole: option.accessRole,
    accountEmail: option.accountEmail,
    accountName: option.accountName,
    label: option.label,
    color: option.color,
    accessToken: entry.token.access_token,
    refreshToken: entry.token.refresh_token,
  } satisfies ResolvedCalendarSource;
}

export async function resolveCalendarSourceForEvent(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
  event: {
    provider?: string | null;
    source_calendar_id?: string | null;
    external_calendar_id?: string | null;
    google_calendar_id?: string | null;
  };
}) {
  const provider = args.event.provider;
  const sourceCalendarId = args.event.source_calendar_id;

  if (provider !== 'google' && provider !== 'microsoft') {
    const workspaceCalendarId =
      sourceCalendarId ??
      (await getPrimaryWorkspaceCalendar(args.sbAdmin, args.wsId))?.id;

    if (!workspaceCalendarId) {
      throw new Error('Workspace primary calendar is unavailable');
    }

    return resolveCalendarSource({
      ...args,
      source: { provider: 'tuturuuu', workspaceCalendarId },
    });
  }

  const entries = await listWritableConnections(args);
  const externalCalendarId =
    args.event.external_calendar_id ?? args.event.google_calendar_id ?? null;
  const entry = entries.find(({ connection }) => {
    if (
      sourceCalendarId &&
      connection.workspace_calendar_id === sourceCalendarId
    ) {
      return connection.provider === provider;
    }

    return (
      connection.provider === provider &&
      connection.calendar_id === externalCalendarId
    );
  });

  if (!entry) {
    throw new Error('Calendar source is unavailable or read-only');
  }

  return {
    provider,
    connectionId: entry.connection.id,
    workspaceCalendarId: entry.connection.workspace_calendar_id,
    externalCalendarId: entry.connection.calendar_id,
    accessRole: entry.connection.access_role,
    accountEmail: entry.token.account_email,
    accountName: entry.token.account_name,
    label: entry.connection.calendar_name,
    color: entry.connection.color,
    accessToken: entry.token.access_token,
    refreshToken: entry.token.refresh_token,
  } satisfies ResolvedCalendarSource;
}

export async function getDefaultCalendarSource(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
}) {
  const options = await listCalendarSourceOptions(args);
  const resolvedDefaultSource = await resolveCalendarSource(args);
  const defaultSourceId = sourceId(resolvedDefaultSource);
  const defaultSource =
    options.find((option) => option.id === defaultSourceId) ??
    (resolvedDefaultSource.provider === 'tuturuuu'
      ? {
          id: defaultSourceId,
          provider: 'tuturuuu' as const,
          workspaceCalendarId: resolvedDefaultSource.workspaceCalendarId,
          label: resolvedDefaultSource.label,
          color: resolvedDefaultSource.color,
          primary: true,
          writable: true,
        }
      : {
          id: defaultSourceId,
          provider: resolvedDefaultSource.provider,
          connectionId: resolvedDefaultSource.connectionId,
          workspaceCalendarId: resolvedDefaultSource.workspaceCalendarId,
          externalCalendarId: resolvedDefaultSource.externalCalendarId,
          accessRole: resolvedDefaultSource.accessRole,
          accountEmail: resolvedDefaultSource.accountEmail,
          accountName: resolvedDefaultSource.accountName,
          label: resolvedDefaultSource.label,
          color: resolvedDefaultSource.color,
          writable: true,
        });

  return {
    defaultSource,
    options,
  };
}

export async function saveDefaultCalendarSource(args: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
  source: CalendarSourceInput;
}) {
  const source = await resolveCalendarSource(args);

  const payload =
    source.provider === 'tuturuuu'
      ? {
          user_id: args.userId,
          ws_id: args.wsId,
          default_provider: 'tuturuuu',
          default_workspace_calendar_id: source.workspaceCalendarId,
          default_calendar_connection_id: null,
        }
      : {
          user_id: args.userId,
          ws_id: args.wsId,
          default_provider: source.provider,
          default_workspace_calendar_id: null,
          default_calendar_connection_id: source.connectionId,
        };

  const { error } = await (args.sbAdmin as any)
    .schema('private')
    .from('calendar_user_workspace_preferences')
    .upsert(payload, { onConflict: 'user_id,ws_id' });

  if (error) throw error;

  return getDefaultCalendarSource(args);
}
