import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { GOOGLE_COLOR_IDS } from '@tuturuuu/utils/google-calendar-colors';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GoogleColorChoiceError } from '../google-color-choices';
import { createRequestGoogleMutationService } from './mutation-request-service';
import { ColorOperationError } from './protocol';
import { createRequestColorOperationService } from './request-service';

/** Candidate route slice stays disabled until every competing writer and source
 * move/create saga participates in the same durable generation boundary. */
export function googleColorOperationModeEnabled() {
  return process.env.CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED === 'true';
}

export function unsupportedGoogleMutation() {
  return NextResponse.json(
    {
      error:
        'Moving a Google event between calendar sources requires recoverable move support',
      code: 'GOOGLE_MUTATION_RECOVERY_UNAVAILABLE',
    },
    { status: 409 }
  );
}

function operationFailure(error: unknown, operationId?: string) {
  if (
    error instanceof GoogleColorChoiceError &&
    [400, 409].includes(error.status)
  )
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  const status =
    error instanceof ColorOperationError
      ? error.reason === 'unauthorized'
        ? 403
        : ['conflict', 'identity'].includes(error.reason)
          ? 409
          : 503
      : error instanceof GoogleColorChoiceError && error.status === 403
        ? 403
        : 503;
  // Do not return provider errors, SQL messages, stored intent or prepared patch.
  console.warn('Google color operation could not complete');
  return NextResponse.json(
    {
      error: operationId
        ? 'Google calendar operation needs recovery'
        : 'Google calendar operation unavailable or in progress',
      ...(operationId ? { operationId } : {}),
    },
    { status }
  );
}

export async function handleRecoverableGoogleColorPut(args: {
  request: Request;
  rawWsId: string;
  eventId: string;
  updates: Record<string, unknown>;
}) {
  const keys = Object.keys(args.updates);
  if (keys.length !== 1 || !['color', 'providerColor'].includes(keys[0]!))
    return unsupportedGoogleMutation();
  let operationId: string | undefined;
  try {
    const service = await createRequestColorOperationService(
      args.request,
      args.rawWsId,
      args.eventId
    );
    const intent = args.updates.providerColor as
      | GoogleProviderColorChoice
      | undefined;
    const colorId =
      args.updates.color === undefined
        ? undefined
        : GOOGLE_COLOR_IDS[args.updates.color as SupportedColor];
    if (!intent && !colorId)
      return NextResponse.json(
        { error: 'Unsupported Google color' },
        { status: 400 }
      );
    const operation = await service.reserve(
      intent ?? {
        connectionId: service.identity.connectionId,
        kind: 'event',
        id: colorId!,
      }
    );
    operationId = operation.id;
    try {
      const complete = await service.execute(operation.id);
      if (complete.phase === 'superseded')
        return NextResponse.json(
          {
            error: 'Google color changed before this operation completed',
            operationId,
          },
          { status: 409 }
        );
    } catch (error) {
      // Choice validation happens before dispatch; only this known validation
      // failure may attempt safe cancel. Provider/storage failures stay pending.
      if (
        error instanceof GoogleColorChoiceError &&
        [400, 409].includes(error.status)
      )
        await service.cancel(operation.id);
      throw error;
    }
    return NextResponse.json(await service.readEvent());
  } catch (error) {
    return operationFailure(error, operationId);
  }
}

const RecoveryBody = z.object({ operationId: z.guid() }).strict();
export async function handleGoogleColorRecovery(
  request: Request,
  rawWsId: string,
  eventId: string,
  action: 'inspect' | 'execute' | 'cancel'
) {
  if (!googleColorOperationModeEnabled())
    return NextResponse.json(
      { error: 'Google color recovery is unavailable' },
      { status: 404 }
    );
  let operationId: string | undefined;
  try {
    const parsed =
      action === 'inspect'
        ? RecoveryBody.safeParse({
            operationId: new URL(request.url).searchParams.get('operationId'),
          })
        : RecoveryBody.safeParse(await request.json());
    if (action !== 'inspect' && !parsed.success)
      return NextResponse.json(
        { error: 'Invalid recovery request' },
        { status: 400 }
      );
    if (
      action === 'inspect' &&
      new URL(request.url).searchParams.has('operationId') &&
      !parsed.success
    )
      return NextResponse.json(
        { error: 'Invalid recovery request' },
        { status: 400 }
      );
    operationId = parsed.success ? parsed.data.operationId : undefined;
    const mutationService = await createRequestGoogleMutationService(
      request,
      rawWsId,
      eventId,
      { recoveryOperationId: operationId }
    );
    const { operation: current } = await mutationService.inspect();
    if (action === 'inspect') {
      return NextResponse.json({
        operation: current
          ? { operationId: current.id, phase: current.phase }
          : null,
      });
    }
    if (!current || current.id !== operationId)
      throw new ColorOperationError('conflict', 'Google operation changed');
    const service =
      current.intent.kind === 'mutation'
        ? mutationService
        : await createRequestColorOperationService(request, rawWsId, eventId);
    const operation =
      action === 'execute'
        ? await service.execute(operationId!)
        : await service.cancel(operationId!);
    return NextResponse.json({
      operationId: operation.id,
      phase: operation.phase,
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Invalid recovery request' },
        { status: 400 }
      );
    return operationFailure(error, operationId);
  }
}

/** Returns after the ledger transaction owns the complete local projection.
 * No caller may issue an unguarded second update/delete after this response. */
export async function handleRecoverableGooglePut(args: {
  request: Request;
  rawWsId: string;
  eventId: string;
  updates: Record<string, unknown>;
}) {
  const keys = Object.keys(args.updates);
  if (keys.length === 1 && ['color', 'providerColor'].includes(keys[0]!))
    return handleRecoverableGoogleColorPut(args);
  if (args.updates.source !== undefined || keys.length === 0)
    return unsupportedGoogleMutation();
  let operationId: string | undefined;
  try {
    const service = await createRequestGoogleMutationService(
      args.request,
      args.rawWsId,
      args.eventId
    );
    const providerPatch: Record<string, unknown> = {};
    for (const [local, provider] of [
      ['title', 'summary'],
      ['description', 'description'],
      ['location', 'location'],
    ] as const)
      if (args.updates[local] !== undefined)
        providerPatch[provider] = args.updates[local];
    if (args.updates.start_at !== undefined)
      providerPatch.start = { dateTime: args.updates.start_at };
    if (args.updates.end_at !== undefined)
      providerPatch.end = { dateTime: args.updates.end_at };
    const choice = args.updates.providerColor as
      | GoogleProviderColorChoice
      | undefined;
    const colorId =
      args.updates.color === undefined
        ? undefined
        : GOOGLE_COLOR_IDS[args.updates.color as SupportedColor];
    if (args.updates.color !== undefined && !colorId)
      return NextResponse.json(
        { error: 'Unsupported Google color' },
        { status: 400 }
      );
    let eventLabelVersion: 0 | 1 | undefined;
    if (choice || colorId) {
      const resolved = await service.resolveColorChoice(
        choice ?? {
          connectionId: service.identity.connectionId,
          kind: 'event',
          id: colorId!,
        }
      );
      Object.assign(providerPatch, resolved.fields);
      eventLabelVersion = resolved.eventLabelVersion;
    }
    const operation = await service.reserve({
      action: 'patch',
      providerPatch,
      eventLabelVersion,
      localPatch:
        args.updates.locked === undefined
          ? {}
          : { locked: args.updates.locked as boolean },
      sendUpdates: keys.some((key) =>
        ['title', 'description', 'location', 'start_at', 'end_at'].includes(key)
      )
        ? 'all'
        : 'none',
    });
    operationId = operation.id;
    const complete = await service.execute(operationId);
    if (complete.phase !== 'applied')
      return NextResponse.json(
        {
          error: 'Google event changed before this operation completed',
          operationId,
        },
        { status: 409 }
      );
    return NextResponse.json(await service.readEvent());
  } catch (error) {
    return operationFailure(error, operationId);
  }
}

export async function handleRecoverableGoogleDelete(args: {
  request: Request;
  rawWsId: string;
  eventId: string;
}) {
  let operationId: string | undefined;
  try {
    const service = await createRequestGoogleMutationService(
      args.request,
      args.rawWsId,
      args.eventId
    );
    const operation = await service.reserve({
      action: 'delete',
      providerPatch: {},
      sendUpdates: 'all',
    });
    operationId = operation.id;
    const complete = await service.execute(operationId);
    if (complete.phase !== 'applied')
      return NextResponse.json(
        {
          error: 'Google event changed before deletion completed',
          operationId,
        },
        { status: 409 }
      );
    return NextResponse.json({
      ...(await service.deletionResult(operationId)),
      message: 'Event deleted successfully',
    });
  } catch (error) {
    return operationFailure(error, operationId);
  }
}
