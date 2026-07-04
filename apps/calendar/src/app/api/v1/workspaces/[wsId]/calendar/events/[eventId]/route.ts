import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { upsertHabitSkip } from '@/lib/calendar/habit-skips';
import {
  createProviderEvent,
  deleteProviderEvent,
  moveProviderEvent,
  updateProviderEvent,
} from '@/lib/calendar/provider-writes';
import {
  type ResolvedCalendarSource,
  resolveCalendarSource,
  resolveCalendarSourceForEvent,
} from '@/lib/calendar/source-resolver';
import {
  getCalendarSyncPreferences,
  resolveOutboundSyncSource,
} from '@/lib/calendar/sync-preferences';
import {
  decryptEventFromStorage,
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

const updateEventSchema = z.object({
  title: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  location: z.string().max(MAX_SEARCH_LENGTH).optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  color: z.string().max(MAX_COLOR_LENGTH).optional(),
  locked: z.boolean().optional(),
  source: CalendarSourceSchema.optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
  }>;
}

function applyProviderSyncFields(
  updatePayload: TablesUpdate<'workspace_calendar_events'>,
  args: {
    error: unknown;
    settingsAvailable: boolean;
    synced: boolean;
  }
) {
  if (!args.settingsAvailable) return;

  if (args.synced) {
    (updatePayload as any).last_synced_at = new Date().toISOString();
    (updatePayload as any).sync_error = null;
    (updatePayload as any).sync_status = 'synced';
    return;
  }

  if (args.error) {
    const message =
      args.error instanceof Error
        ? args.error.message
        : 'External calendar sync failed';
    (updatePayload as any).sync_error = message.slice(0, 1000);
    (updatePayload as any).sync_status = 'failed';
    return;
  }

  (updatePayload as any).sync_error = null;
  (updatePayload as any).sync_status = 'local_only';
}

async function authorizeWorkspaceCalendarEventAccess(
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
    wsId,
    userId: user.id,
  };
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeWorkspaceCalendarEventAccess(request, rawWsId);
  if ('error' in access) return access.error;
  const { sbAdmin, wsId } = access;

  try {
    const { data: event, error } = await sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({}, { status: 404 });
      }
      throw error;
    }

    // Decrypt if encrypted
    const decryptedEvent = await decryptEventFromStorage(event, wsId);

    return NextResponse.json(decryptedEvent);
  } catch (error) {
    console.error('Calendar event API error', { wsId, eventId, error });
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeWorkspaceCalendarEventAccess(request, rawWsId);
  if ('error' in access) return access.error;
  const { sbAdmin, wsId, userId } = access;

  try {
    try {
      z.guid().parse(wsId);
      z.guid().parse(eventId);
    } catch {
      return NextResponse.json(
        { error: 'Invalid workspace or event ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = updateEventSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error },
        { status: 400 }
      );
    }

    const updates = validationResult.data;

    const { data: existingEvent, error: existingError } = await sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      throw existingError;
    }

    const decryptedExisting = await decryptEventFromStorage(
      existingEvent,
      wsId
    );
    const workspaceKey = await getWorkspaceKey(wsId);
    const hasSensitiveUpdates =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.location !== undefined;
    const hasSourceUpdate = updates.source !== undefined;

    const updatePayload: TablesUpdate<'workspace_calendar_events'> = {};
    const nextPlainEvent = {
      title: updates.title ?? decryptedExisting.title ?? '',
      description: updates.description ?? decryptedExisting.description ?? '',
      location: updates.location ?? decryptedExisting.location ?? '',
      start_at: updates.start_at ?? existingEvent.start_at,
      end_at: updates.end_at ?? existingEvent.end_at,
    };

    const currentSource = await resolveCalendarSourceForEvent({
      sbAdmin,
      wsId,
      userId,
      event: existingEvent,
    });
    const targetSource = hasSourceUpdate
      ? await resolveCalendarSource({
          sbAdmin,
          wsId,
          userId,
          source: updates.source ?? null,
        })
      : currentSource;
    const syncPreferences = await getCalendarSyncPreferences({
      sbAdmin,
      wsId,
      userId,
    });

    const sourceChanged =
      currentSource.provider !== targetSource.provider ||
      (targetSource.provider !== 'tuturuuu' &&
        currentSource.provider !== 'tuturuuu' &&
        currentSource.externalCalendarId !== targetSource.externalCalendarId) ||
      (targetSource.provider === 'tuturuuu' &&
        currentSource.provider === 'tuturuuu' &&
        currentSource.workspaceCalendarId !== targetSource.workspaceCalendarId);

    const touchesProviderFields =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.location !== undefined ||
      updates.start_at !== undefined ||
      updates.end_at !== undefined ||
      sourceChanged;

    let providerResult: Awaited<ReturnType<typeof moveProviderEvent>> = null;
    let providerWriteError: unknown = null;
    let providerSource: ResolvedCalendarSource = targetSource;
    if (touchesProviderFields) {
      if (sourceChanged) {
        providerResult = await moveProviderEvent({
          fromSource: currentSource,
          toSource: targetSource,
          existingEvent,
          event: nextPlainEvent,
        });
      } else if (targetSource.provider !== 'tuturuuu') {
        providerResult = await updateProviderEvent({
          source: targetSource,
          existingEvent,
          event: nextPlainEvent,
        });
      } else if (!hasSourceUpdate) {
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
              event: nextPlainEvent,
            });
          } catch (error) {
            providerWriteError = error;
            console.warn('Failed to mirror native calendar event update', {
              wsId,
              eventId,
              provider: outboundSource.provider,
              error,
            });
          }
        }
      }
    }

    if (
      hasSourceUpdate ||
      sourceChanged ||
      providerResult ||
      providerWriteError
    ) {
      const persistedSource = providerResult ? providerSource : targetSource;
      updatePayload.provider = persistedSource.provider;
      updatePayload.source_calendar_id = persistedSource.workspaceCalendarId;

      if (persistedSource.provider === 'tuturuuu') {
        updatePayload.external_calendar_id = null;
        updatePayload.external_event_id = null;
        updatePayload.google_calendar_id = null;
        updatePayload.google_event_id = null;
      } else {
        const externalCalendarId =
          providerResult?.externalCalendarId ??
          existingEvent.external_calendar_id ??
          existingEvent.google_calendar_id;
        const externalEventId =
          providerResult?.externalEventId ??
          existingEvent.external_event_id ??
          existingEvent.google_event_id;

        updatePayload.external_calendar_id = externalCalendarId;
        updatePayload.external_event_id = externalEventId;
        updatePayload.google_calendar_id =
          persistedSource.provider === 'google' ? externalCalendarId : null;
        updatePayload.google_event_id =
          persistedSource.provider === 'google' ? externalEventId : null;
      }

      applyProviderSyncFields(updatePayload, {
        error: providerWriteError,
        settingsAvailable: syncPreferences.settingsAvailable,
        synced: !!providerResult,
      });
    }

    if (hasSensitiveUpdates && workspaceKey) {
      const isCurrentlyEncrypted = existingEvent?.is_encrypted === true;

      interface EncryptableEventFields {
        title: string;
        description: string;
        location?: string | null;
      }

      if (isCurrentlyEncrypted) {
        // Event is already encrypted - only encrypt the updated fields
        // Construct a reduced object with only present updates to avoid encrypting
        // undefined fields as empty strings, which would overwrite existing data
        const fieldsToEncrypt: Partial<EncryptableEventFields> = {};
        if (updates.title !== undefined) fieldsToEncrypt.title = updates.title;
        if (updates.description !== undefined)
          fieldsToEncrypt.description = updates.description;
        if (updates.location !== undefined)
          fieldsToEncrypt.location = updates.location;

        const encryptedFields = await encryptEventForStorage(
          wsId,
          fieldsToEncrypt,
          workspaceKey
        );

        if (updates.title !== undefined) {
          updatePayload.title = encryptedFields.title;
        }
        if (updates.description !== undefined) {
          updatePayload.description = encryptedFields.description;
        }
        if (updates.location !== undefined) {
          updatePayload.location = encryptedFields.location;
        }
        // Keep is_encrypted = true (already encrypted)
        updatePayload.is_encrypted = true;
      } else {
        const encryptedFields = await encryptEventForStorage(
          wsId,
          {
            title: nextPlainEvent.title,
            description: nextPlainEvent.description,
            location: nextPlainEvent.location,
          },
          workspaceKey
        );

        updatePayload.title = encryptedFields.title;
        updatePayload.description = encryptedFields.description;
        updatePayload.location = encryptedFields.location;
        updatePayload.is_encrypted = true;
      }
    } else if (hasSensitiveUpdates) {
      if (existingEvent?.is_encrypted === true) {
        return NextResponse.json(
          {
            error:
              'Cannot update encrypted event: encryption key unavailable. Please contact your workspace administrator.',
            code: 'E2EE_KEY_UNAVAILABLE',
          },
          { status: 400 }
        );
      }

      if (updates.title !== undefined) {
        updatePayload.title = updates.title;
      }
      if (updates.description !== undefined) {
        updatePayload.description = updates.description;
      }
      if (updates.location !== undefined) {
        updatePayload.location = updates.location;
      }
    }

    if (updates.start_at !== undefined) {
      updatePayload.start_at = updates.start_at;
    }
    if (updates.end_at !== undefined) {
      updatePayload.end_at = updates.end_at;
    }
    if (updates.color !== undefined) {
      updatePayload.color = updates.color;
    }
    if (updates.locked !== undefined) {
      updatePayload.locked = updates.locked;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    const { data, error } = await sbAdmin
      .from('workspace_calendar_events')
      .update(updatePayload)
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Event not found or not updated' },
          { status: 404 }
        );
      }
      throw error;
    }

    if (hasSensitiveUpdates) {
      const decryptedStored = await decryptEventFromStorage(data, wsId);

      return NextResponse.json({
        ...data,
        title: updates.title ?? decryptedStored.title,
        description: updates.description ?? decryptedStored.description,
        location: updates.location ?? decryptedStored.location,
      });
    }

    const decryptedEvent = await decryptEventFromStorage(data, wsId);
    return NextResponse.json(decryptedEvent);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('source is unavailable or read-only')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Calendar event API error', { wsId, eventId, error });
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeWorkspaceCalendarEventAccess(request, rawWsId);
  if ('error' in access) return access.error;
  const { sbAdmin, wsId, userId } = access;

  try {
    const { data: existingEvent, error: existingError } = await sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      throw existingError;
    }

    if (
      existingEvent.provider === 'google' ||
      existingEvent.provider === 'microsoft'
    ) {
      const source = await resolveCalendarSourceForEvent({
        sbAdmin,
        wsId,
        userId,
        event: existingEvent,
      });

      await deleteProviderEvent({
        source,
        existingEvent,
      });
    }

    const [linkedHabitResult, linkedTaskResult] = await Promise.all([
      sbAdmin
        .from('habit_calendar_events')
        .select('habit_id, occurrence_date')
        .eq('event_id', eventId)
        .maybeSingle(),
      sbAdmin
        .from('task_calendar_events')
        .select('task_id')
        .eq('event_id', eventId)
        .maybeSingle(),
    ]);

    if (
      linkedHabitResult.data?.habit_id &&
      linkedHabitResult.data?.occurrence_date
    ) {
      await upsertHabitSkip(sbAdmin as any, {
        wsId,
        habitId: linkedHabitResult.data.habit_id,
        occurrenceDate: linkedHabitResult.data.occurrence_date,
        createdBy: userId,
        sourceEventId: eventId,
      });
    }

    const { error } = await sbAdmin
      .from('workspace_calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('ws_id', wsId);

    if (error) throw error;

    return NextResponse.json({
      message: 'Event deleted successfully',
      linkedTaskId: linkedTaskResult.data?.task_id ?? null,
      skippedHabitDate: linkedHabitResult.data?.occurrence_date ?? null,
      skippedHabitId: linkedHabitResult.data?.habit_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('source is unavailable or read-only')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Calendar event API error', { wsId, eventId, error });
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
