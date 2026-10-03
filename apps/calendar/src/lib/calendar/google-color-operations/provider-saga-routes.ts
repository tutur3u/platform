import { google } from '@tuturuuu/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { GOOGLE_COLOR_IDS } from '@tuturuuu/utils/google-calendar-colors';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '../../workspace-encryption';
import { resolveGoogleColorChoice } from '../google-color-choices';
import { createGoogleAuthClient } from '../provider-writes';
import type { ResolvedCalendarSource } from '../source-resolver';
import { ColorOperationError } from './protocol';
import { type SagaEndpoint, sagaGoogleEventId } from './provider-saga-protocol';
import { createRoutedProviderSagaService } from './provider-saga-route-service';
import { operationFailure } from './route-handlers';

export function unsupportedProviderSaga() {
  return NextResponse.json(
    {
      error: 'This calendar mutation requires recoverable provider support',
      code: 'CALENDAR_MUTATION_RECOVERY_UNAVAILABLE',
    },
    { status: 409, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

async function endpoint(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  eventId: string;
  source: ResolvedCalendarSource;
  providerEventId: string | null;
}): Promise<SagaEndpoint> {
  const { source, wsId, eventId } = args;
  if (source.provider === 'tuturuuu')
    return {
      provider: 'tuturuuu',
      wsId,
      eventId,
      workspaceCalendarId: source.workspaceCalendarId,
    };
  const { data, error } = await args.sbAdmin
    .from('calendar_connections')
    .select('auth_token_id')
    .eq('id', source.connectionId)
    .eq('ws_id', wsId)
    .eq('provider', source.provider)
    .eq('is_enabled', true)
    .maybeSingle();
  if (error || !data?.auth_token_id)
    throw new ColorOperationError('identity', 'Calendar connection changed');
  return {
    provider: source.provider,
    workspaceCalendarId: source.workspaceCalendarId,
    identity: {
      wsId,
      eventId,
      connectionId: source.connectionId,
      authTokenId: data.auth_token_id,
      calendarId: source.externalCalendarId,
      providerEventId: args.providerEventId,
    },
  };
}

type Common = {
  request: Request;
  rawWsId: string;
  wsId: string;
  sbAdmin: TypedSupabaseClient;
};
export async function handleProviderSagaCreate(
  args: Common & {
    source: ResolvedCalendarSource;
    event: Record<string, unknown>;
  }
) {
  if (
    args.source.provider !== 'google' ||
    args.event.invitation ||
    args.event.task_id
  )
    return unsupportedProviderSaga();
  const parsedId = z.uuidv7().safeParse(args.event.requestId);
  if (!parsedId.success)
    return NextResponse.json(
      { error: 'A calendar request ID is required' },
      { status: 400 }
    );
  const eventId = parsedId.data;
  let admitted = false;
  try {
    const destination = await endpoint({
      ...args,
      eventId,
      providerEventId: sagaGoogleEventId(eventId),
    });
    const service = await createRoutedProviderSagaService(
      args.request,
      args.rawWsId,
      eventId,
      eventId
    );
    const providerEvent: Record<string, unknown> = {
      summary: args.event.title,
      description: args.event.description ?? '',
      location: args.event.location ?? '',
      start: { dateTime: args.event.start_at },
      end: { dateTime: args.event.end_at },
    };
    if (args.event.providerColor) {
      const resolved = await resolveGoogleColorChoice(
        google.calendar({
          version: 'v3',
          auth: createGoogleAuthClient(args.source),
        }),
        args.source,
        args.event.providerColor as Parameters<
          typeof resolveGoogleColorChoice
        >[2]
      );
      Object.assign(providerEvent, resolved.fields);
    } else if (args.event.color)
      providerEvent.colorId =
        GOOGLE_COLOR_IDS[args.event.color as SupportedColor];
    // Placeholder and sealed intent require an existing key; no provider call
    // dispatches until the transaction atomically owns both row and ledger.
    const key = await getWorkspaceKey(args.wsId);
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new ColorOperationError('unavailable', 'Workspace key unavailable');
    const encrypted = await encryptEventForStorage(
      args.wsId,
      {
        title: String(args.event.title),
        description: String(args.event.description ?? ''),
        location: args.event.location as string | null | undefined,
      },
      key
    );
    const operation = await service.reserve({
      operationId: eventId,
      binding: { action: 'create', mode: 'insert', source: null, destination },
      payload: {
        event: providerEvent,
        localPatch: { locked: args.event.locked ?? false },
        sendUpdates: 'none',
        eventLabelVersion:
          (args.event.providerColor as { kind?: string } | undefined)?.kind &&
          (args.event.providerColor as { kind?: string }).kind !== 'event'
            ? 1
            : 0,
      },
      placeholder: {
        ...encrypted,
        start_at: args.event.start_at,
        end_at: args.event.end_at,
        color: args.event.color,
        locked: args.event.locked ?? false,
      },
    });
    admitted = true;
    const complete = await service.execute(operation.id);
    if (complete.phase !== 'applied')
      return NextResponse.json(
        { error: 'Calendar creation changed', operationId: operation.id },
        { status: 409 }
      );
    return NextResponse.json(
      await service.readEvent(operation.prepared.binding),
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return operationFailure(error, admitted ? eventId : undefined);
  }
}

export async function handleProviderSagaMove(
  args: Common & {
    eventId: string;
    existingEvent: Parameters<typeof decryptEventFromStorage>[0];
    source: ResolvedCalendarSource;
    destination: ResolvedCalendarSource;
    updates: Record<string, unknown>;
  }
) {
  // A move is one conditional provider transition. Combining content edits is
  // deliberately rejected before key resolution, admission or provider access.
  if (
    Object.keys(args.updates).some(
      (key) => !['source', 'locked'].includes(key)
    ) ||
    args.source.provider === 'microsoft' ||
    args.destination.provider === 'microsoft'
  )
    return unsupportedProviderSaga();
  let operationId: string | undefined;
  try {
    const originalId =
      args.existingEvent.external_event_id ??
      args.existingEvent.google_event_id;
    const source = await endpoint({
      ...args,
      providerEventId: typeof originalId === 'string' ? originalId : null,
    });
    const destination = await endpoint({
      ...args,
      source: args.destination,
      providerEventId:
        args.destination.provider === 'google' && source.provider === 'google'
          ? source.identity.providerEventId
          : null,
    });
    let mode: 'google-move' | 'insert' | 'external-to-native';
    if (source.provider === 'google' && destination.provider === 'google') {
      if (
        source.identity.authTokenId !== destination.identity.authTokenId ||
        source.identity.calendarId === destination.identity.calendarId
      )
        return unsupportedProviderSaga();
      mode = 'google-move';
    } else if (
      source.provider === 'tuturuuu' &&
      destination.provider === 'google'
    )
      mode = 'insert';
    else if (
      source.provider === 'google' &&
      destination.provider === 'tuturuuu'
    )
      mode = 'external-to-native';
    else return unsupportedProviderSaga();
    const service = await createRoutedProviderSagaService(
      args.request,
      args.rawWsId,
      args.eventId
    );
    const plain =
      mode === 'insert'
        ? await decryptEventFromStorage(args.existingEvent, args.wsId)
        : null;
    const event = plain
      ? {
          summary: plain.title ?? '',
          description: plain.description ?? '',
          location: plain.location ?? '',
          ...(GOOGLE_COLOR_IDS[args.existingEvent.color as SupportedColor]
            ? {
                colorId:
                  GOOGLE_COLOR_IDS[args.existingEvent.color as SupportedColor],
              }
            : {}),
          start: { dateTime: args.existingEvent.start_at },
          end: { dateTime: args.existingEvent.end_at },
        }
      : {};
    const operation = await service.reserve({
      binding: { action: 'move', mode, source, destination },
      // Ephemeral encrypted DB row: admission compares it under the row lock.
      // It must never become a public binding or durable journal field.
      ...(mode === 'insert'
        ? { nativeSnapshot: { ...args.existingEvent } }
        : {}),
      payload: {
        event,
        localPatch:
          args.updates.locked === undefined
            ? {}
            : { locked: args.updates.locked },
        sendUpdates: 'none',
      },
    });
    operationId = operation.id;
    const complete = await service.execute(operation.id);
    if (complete.phase !== 'applied')
      return NextResponse.json(
        { error: 'Calendar source changed', operationId },
        { status: 409 }
      );
    return NextResponse.json(
      await service.readEvent(operation.prepared.binding),
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return operationFailure(error, operationId);
  }
}
