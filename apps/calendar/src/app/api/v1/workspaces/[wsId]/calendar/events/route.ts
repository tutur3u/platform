import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH,
  MAX_CALENDAR_EVENT_TITLE_LENGTH,
  MAX_COLOR_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { createProviderEvent } from '@/lib/calendar/provider-writes';
import {
  type ResolvedCalendarSource,
  resolveCalendarSource,
} from '@/lib/calendar/source-resolver';
import {
  getCalendarSyncPreferences,
  resolveOutboundSyncSource,
} from '@/lib/calendar/sync-preferences';
import {
  decryptEventsFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

const CalendarSourceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('tuturuuu'),
    workspaceCalendarId: z.guid().optional().nullable(),
  }),
  z.object({
    provider: z.literal('google'),
    connectionId: z.guid(),
  }),
  z.object({
    provider: z.literal('microsoft'),
    connectionId: z.guid(),
  }),
]);

const CreateEventSchema = z.object({
  title: z.string().min(1).max(MAX_CALENDAR_EVENT_TITLE_LENGTH),
  description: z
    .string()
    .max(MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH)
    .nullable()
    .optional(),
  location: z.string().max(MAX_SEARCH_LENGTH).nullable().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  color: z.string().max(MAX_COLOR_LENGTH).optional(),
  locked: z.boolean().optional(),
  task_id: z.guid().nullable().optional(),
  source: CalendarSourceSchema.optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function getProviderSyncFields(args: {
  error: unknown;
  settingsAvailable: boolean;
  synced: boolean;
}) {
  if (!args.settingsAvailable) return {};

  if (args.synced) {
    return {
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      sync_status: 'synced',
    };
  }

  if (args.error) {
    const message =
      args.error instanceof Error
        ? args.error.message
        : 'External calendar sync failed';

    return {
      sync_error: message.slice(0, 1000),
      sync_status: 'failed',
    };
  }

  return {
    sync_error: null,
    sync_status: 'local_only',
  };
}

async function authorizeWorkspaceCalendarAccess(
  request: Request,
  rawWsId: string
) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) {
    return { error: auth.response };
  }
  const { user, supabase } = auth;
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return {
    sbAdmin: await createAdminClient(),
    userId: user.id,
    wsId,
  };
}

export async function GET(request: Request, { params }: Params) {
  const access = await authorizeWorkspaceCalendarAccess(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  const { sbAdmin, wsId } = access;

  // Get the start_at and end_at from the URL
  const url = new URL(request.url);
  const start_at = url.searchParams.get('start_at');
  const end_at = url.searchParams.get('end_at');

  if (!start_at || !end_at) {
    return NextResponse.json(
      { error: 'Start and end dates are required' },
      { status: 400 }
    );
  }

  try {
    // Query events that overlap with the requested date range
    // Event overlaps if: event_start < end_at AND event_end > start_at
    const query = sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId)
      .lt('start_at', new Date(end_at).toISOString()) // Event starts before range ends
      .gt('end_at', new Date(start_at).toISOString()) // Event ends after range starts
      .order('start_at', { ascending: true });

    const { data: events, error } = await query;

    if (error) throw error;

    // Decrypt encrypted events
    const decryptedEvents = await decryptEventsFromStorage(events || [], wsId);

    return NextResponse.json({
      data: decryptedEvents,
      count: decryptedEvents.length,
    });
  } catch (error) {
    console.error('Calendar events API error', { wsId, error });
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const access = await authorizeWorkspaceCalendarAccess(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  const { sbAdmin, wsId, userId } = access;

  try {
    const body = await request.json();
    const event = CreateEventSchema.parse(body);
    const source = await resolveCalendarSource({
      sbAdmin,
      wsId,
      userId,
      source: event.source ?? null,
    });
    const syncPreferences = await getCalendarSyncPreferences({
      sbAdmin,
      wsId,
      userId,
    });

    const providerWriteEvent = {
      title: event.title,
      description: event.description ?? '',
      location: event.location ?? '',
      start_at: event.start_at,
      end_at: event.end_at,
    };
    let providerSource: ResolvedCalendarSource = source;
    let providerWriteError: unknown = null;
    let providerResult: Awaited<ReturnType<typeof createProviderEvent>> = null;

    if (source.provider !== 'tuturuuu') {
      providerResult = await createProviderEvent({
        source,
        event: providerWriteEvent,
      });
    } else {
      const outboundSource = await resolveOutboundSyncSource({
        sbAdmin,
        wsId,
        userId,
      });

      if (outboundSource) {
        providerSource = outboundSource;
        try {
          providerResult = await createProviderEvent({
            source: outboundSource,
            event: providerWriteEvent,
          });
        } catch (error) {
          providerWriteError = error;
          console.warn('Failed to mirror native calendar event', {
            wsId,
            provider: outboundSource.provider,
            error,
          });
        }
      }
    }

    // Get workspace encryption key (read-only, does not auto-create)
    // This ensures encryption only happens if E2EE was explicitly enabled
    const workspaceKey = await getWorkspaceKey(wsId);

    // Encrypt sensitive fields only if encryption is already enabled
    const encryptedFields = await encryptEventForStorage(
      wsId,
      {
        title: event.title || '',
        description: event.description || '',
        location: event.location,
      },
      workspaceKey
    );

    const provider =
      providerResult?.provider ??
      (source.provider === 'tuturuuu' ? 'tuturuuu' : source.provider);
    const externalCalendarId = providerResult?.externalCalendarId ?? null;
    const externalEventId = providerResult?.externalEventId ?? null;
    const sourceCalendarId =
      providerResult && providerSource.provider !== 'tuturuuu'
        ? providerSource.workspaceCalendarId
        : source.workspaceCalendarId;

    const { data, error } = await (sbAdmin as any)
      .from('workspace_calendar_events')
      .insert({
        title: encryptedFields.title,
        description: encryptedFields.description,
        location: encryptedFields.location,
        start_at: event.start_at,
        end_at: event.end_at,
        color: event.color || 'blue',
        locked: event.locked || false,
        task_id: event.task_id ?? null,
        ws_id: wsId,
        is_encrypted: encryptedFields.is_encrypted,
        provider,
        source_calendar_id: sourceCalendarId,
        external_calendar_id: externalCalendarId,
        external_event_id: externalEventId,
        google_calendar_id: provider === 'google' ? externalCalendarId : null,
        google_event_id: provider === 'google' ? externalEventId : null,
        ...getProviderSyncFields({
          error: providerWriteError,
          settingsAvailable: syncPreferences.settingsAvailable,
          synced: !!providerResult,
        }),
      })
      .select()
      .single();

    if (error) throw error;

    // Return decrypted data to client
    return NextResponse.json(
      {
        ...data,
        title: event.title || '',
        description: event.description || '',
        location: event.location,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    const message =
      error instanceof Error ? error.message : 'Calendar event creation failed';
    const isSourceError = message.toLowerCase().includes('calendar source');
    console.error('Calendar events API error', { wsId, error });
    return NextResponse.json(
      {
        error: isSourceError
          ? message
          : 'An error occurred while processing your request',
      },
      { status: isSourceError ? 400 : 500 }
    );
  }
}
