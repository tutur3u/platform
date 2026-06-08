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
import { resolveCalendarSource } from '@/lib/calendar/source-resolver';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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
    serverLogger.error('Calendar events API error', { wsId, error });
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

    const providerResult =
      source.provider === 'tuturuuu'
        ? null
        : await createProviderEvent({
            source,
            event: {
              title: event.title,
              description: event.description ?? '',
              location: event.location ?? '',
              start_at: event.start_at,
              end_at: event.end_at,
            },
          });

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
      source.provider === 'tuturuuu'
        ? source.workspaceCalendarId
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
    serverLogger.error('Calendar events API error', { wsId, error });
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
