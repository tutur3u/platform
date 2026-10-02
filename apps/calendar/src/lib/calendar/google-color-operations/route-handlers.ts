import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { GOOGLE_COLOR_IDS } from '@tuturuuu/utils/google-calendar-colors';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GoogleColorChoiceError } from '../google-color-choices';
import { ColorOperationError } from './protocol';
import { createRequestColorOperationService } from './request-service';

/** Candidate route slice stays disabled until SQL, import and competitor proofs
 * pass. Enabling it deliberately suspends Google content/move/delete writes:
 * their durable encrypted replay is not implemented by this color-only ledger. */
export function googleColorOperationModeEnabled() {
  return process.env.CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED === 'true';
}

export function unsupportedGoogleMutation() {
  return NextResponse.json(
    {
      error:
        'This Google event supports color changes only while recoverable color operations are enabled',
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
        ? 'Google color operation needs recovery'
        : 'Google color operation unavailable or in progress',
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
    const service = await createRequestColorOperationService(
      request,
      rawWsId,
      eventId
    );
    if (action === 'inspect') {
      const { operation } = await service.inspect();
      return NextResponse.json({
        operation: operation
          ? { operationId: operation.id, phase: operation.phase }
          : null,
      });
    }
    const parsed = RecoveryBody.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid recovery request' },
        { status: 400 }
      );
    operationId = parsed.data.operationId;
    const operation =
      action === 'execute'
        ? await service.execute(operationId)
        : await service.cancel(operationId);
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
