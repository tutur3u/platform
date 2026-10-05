import type { Json, TablesUpdate } from '@tuturuuu/types';
import { googleColorCompatibilityValue } from '@tuturuuu/utils/google-calendar-colors';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hydrateEventSourceColors } from '@/lib/calendar/event-source-colors';
import { updateEventSchema } from '@/lib/calendar/event-update-schema';
import { GoogleColorChoiceError } from '@/lib/calendar/google-color-choices';
import { handleRetainedNativeMutation } from '@/lib/calendar/google-color-operations/native-generation-routes';
import { ColorOperationError } from '@/lib/calendar/google-color-operations/protocol';
import {
  handleProviderSagaMove,
  unsupportedProviderSaga,
} from '@/lib/calendar/google-color-operations/provider-saga-routes';
import { getCalendarRetainedGeneration } from '@/lib/calendar/google-color-operations/retained-generation-request-access';
import {
  googleColorOperationModeEnabled,
  handleRecoverableGoogleDelete,
  handleRecoverableGooglePut,
  operationFailure,
} from '@/lib/calendar/google-color-operations/route-handlers';
import { refreshOwnedGoogleSourceColor } from '@/lib/calendar/google-source-color-refresh';
import { upsertHabitSkip } from '@/lib/calendar/habit-skips';
import { applyProviderSyncFields } from '@/lib/calendar/provider-sync-fields';
import {
  createProviderEvent,
  deleteProviderEvent,
  moveProviderEvent,
  updateProviderEvent,
} from '@/lib/calendar/provider-writes';
import { providerReadonlyEventResponse } from '@/lib/calendar/recurrence/provider/readonly';
import {
  type ResolvedCalendarSource,
  resolveCalendarSource,
  resolveCalendarSourceForEvent,
} from '@/lib/calendar/source-resolver';
import {
  getCalendarSyncPreferences,
  resolveOutboundSyncSource,
} from '@/lib/calendar/sync-preferences';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  const { sbAdmin, wsId, userId } = access;

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

    const [hydratedEvent] = await hydrateEventSourceColors({
      sbAdmin,
      wsId,
      userId,
      events: [decryptedEvent],
    });
    return NextResponse.json(hydratedEvent);
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
  const access = await authorizeCalendarEventManagement(request, rawWsId);
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

    const readonlyResponse = await providerReadonlyEventResponse({
      sbAdmin,
      wsId,
      userId,
      eventId,
    });
    if (readonlyResponse) return readonlyResponse;
    const body = await request.json();
    const validationResult = updateEventSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error },
        { status: 400 }
      );
    }

    const updates = validationResult.data;
    if (updates.providerColor && !googleColorOperationModeEnabled())
      return unsupportedProviderSaga();
    if (updates.providerColor && updates.color !== undefined)
      return NextResponse.json(
        { error: 'Choose either native color or provider color' },
        { status: 400 }
      );

    const retained = await getCalendarRetainedGeneration(
      request,
      rawWsId,
      eventId
    );
    if (retained?.pending) return unsupportedProviderSaga();
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
      (existingEvent.scheduling_metadata as Record<string, unknown> | null)
        ?.meeting_delivery === 'pending'
    ) {
      return NextResponse.json(
        {
          error:
            'This invitation is still being delivered. Check its status before changing it',
        },
        { status: 409 }
      );
    }

    if (googleColorOperationModeEnabled() || retained) {
      if (updates.source) {
        const source = await resolveCalendarSourceForEvent({
          sbAdmin,
          wsId,
          userId,
          event: existingEvent,
        });
        const destination = await resolveCalendarSource({
          sbAdmin,
          wsId,
          userId,
          source: updates.source,
        });
        return handleProviderSagaMove({
          request,
          rawWsId,
          wsId,
          eventId,
          sbAdmin,
          existingEvent,
          source,
          destination,
          updates,
        });
      }
      if (existingEvent.provider === 'google')
        return handleRecoverableGooglePut({
          request,
          rawWsId,
          eventId,
          updates,
        });
      if (existingEvent.provider === 'microsoft')
        return unsupportedProviderSaga();
      if (retained)
        return handleRetainedNativeMutation({
          request,
          rawWsId,
          wsId,
          eventId,
          sbAdmin,
          updates,
        });
      if (await resolveOutboundSyncSource({ sbAdmin, wsId, userId }))
        return unsupportedProviderSaga();
      return handleRetainedNativeMutation({
        request,
        rawWsId,
        wsId,
        eventId,
        sbAdmin,
        updates,
      });
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
      color: updates.color,
      providerColor: updates.providerColor,
      nativeColorChange: updates.color !== undefined,
      providerColorOnly:
        (updates.color !== undefined ||
          updates.providerColor !== undefined ||
          hasSourceUpdate) &&
        updates.title === undefined &&
        updates.description === undefined &&
        updates.location === undefined &&
        updates.start_at === undefined &&
        updates.end_at === undefined,
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

    if (
      updates.providerColor &&
      (targetSource.provider !== 'google' ||
        targetSource.connectionId !== updates.providerColor.connectionId)
    ) {
      throw new GoogleColorChoiceError(
        'Color choice does not belong to the selected Google calendar'
      );
    }
    const touchesProviderFields =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.location !== undefined ||
      updates.start_at !== undefined ||
      updates.end_at !== undefined ||
      updates.color !== undefined ||
      updates.providerColor !== undefined ||
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

    if (providerResult?.googleSourceColor)
      await refreshOwnedGoogleSourceColor({
        sbAdmin,
        wsId,
        source: providerSource,
        background: providerResult.googleSourceColor,
      });
    if (providerResult?.googleColor) {
      updatePayload.scheduling_metadata = {
        ...((existingEvent.scheduling_metadata as Record<string, Json>) ?? {}),
        google_color: { ...providerResult.googleColor },
      };
      updatePayload.color = googleColorCompatibilityValue(
        providerResult.googleColor.color_id
      );
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
    if (error instanceof ColorOperationError) return operationFailure(error);
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    if (error instanceof GoogleColorChoiceError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
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
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  const { sbAdmin, wsId, userId } = access;

  try {
    const readonlyResponse = await providerReadonlyEventResponse({
      sbAdmin,
      wsId,
      userId,
      eventId,
    });
    if (readonlyResponse) return readonlyResponse;
    const retained = await getCalendarRetainedGeneration(
      request,
      rawWsId,
      eventId
    );
    if (retained?.pending) return unsupportedProviderSaga();
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
      (existingEvent.scheduling_metadata as Record<string, unknown> | null)
        ?.meeting_delivery === 'pending'
    ) {
      return NextResponse.json(
        {
          error:
            'This invitation is still being delivered. Check its status before changing it',
        },
        { status: 409 }
      );
    }

    if (googleColorOperationModeEnabled() || retained) {
      if (existingEvent.provider === 'google')
        return handleRecoverableGoogleDelete({ request, rawWsId, eventId });
      if (existingEvent.provider === 'microsoft')
        return unsupportedProviderSaga();
      if (retained)
        return handleRetainedNativeMutation({
          request,
          rawWsId,
          wsId,
          eventId,
          sbAdmin,
        });
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
    if (error instanceof ColorOperationError) return operationFailure(error);
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
