import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';

/** Server-only persistence contract. No credential or caller metadata is stored. */
export type ColorOperationIdentity = {
  wsId: string;
  eventId: string;
  connectionId: string;
  authTokenId: string;
  calendarId: string;
  providerEventId: string;
};

export function sameColorOperationIdentity(
  a: ColorOperationIdentity,
  b: ColorOperationIdentity
) {
  return (
    (Object.keys(a) as (keyof ColorOperationIdentity)[]).every(
      (key) => a[key] === b[key]
    ) && Object.keys(a).length === Object.keys(b).length
  );
}

export type PreparedColorPatch = {
  baseETag: string;
  eventLabelVersion: 0 | 1;
  patch: Record<string, unknown>;
};
export type ColorOperation = {
  id: string;
  generation: string;
  requestHash: string;
  intent: GoogleProviderColorChoice;
  identity: ColorOperationIdentity;
  phase:
    | 'reserved'
    | 'prepared'
    | 'dispatched'
    | 'applied'
    | 'superseded'
    | 'canceled';
  prepared: PreparedColorPatch | null;
};
export type ProviderColorSnapshot = {
  etag: string;
  operationMarker: string | null;
  // The adapter derives this projection from the actual Google event/context.
  metadata: Record<string, unknown>;
  compatibilityColor: string;
};
export const COLOR_OPERATION_MARKER = 'tuturuuuColorOperation';

export class ColorOperationError extends Error {
  constructor(
    readonly reason:
      | 'conflict'
      | 'unavailable'
      | 'unauthorized'
      | 'identity'
      | 'storage',
    message: string
  ) {
    super(message);
  }
}

export interface ColorOperationRepository {
  reserve(input: {
    id: string;
    requestHash: string;
    intent: GoogleProviderColorChoice;
    identity: ColorOperationIdentity;
    expectedGeneration: string;
  }): Promise<ColorOperation>;
  read(
    identity: ColorOperationIdentity,
    operationId: string
  ): Promise<ColorOperation>;
  // First preparation wins; subsequent resumptions receive that exact record.
  prepare(
    operation: ColorOperation,
    prepared: PreparedColorPatch
  ): Promise<ColorOperation>;
  // Must atomically check operationId/generation/identity and record dispatched
  // BEFORE any network attempt. No phase/lease expiry replaces the operation.
  markDispatched(operation: ColorOperation): Promise<ColorOperation>;
  // One transaction: compare token/generation/identity; merge owned Google keys
  // into latest metadata; persist projection+sync status+completion together.
  finalize(
    operation: ColorOperation,
    snapshot: ProviderColorSnapshot,
    outcome: 'applied' | 'superseded'
  ): Promise<ColorOperation>;
  cancelUnsent(operation: ColorOperation): Promise<ColorOperation>;
}

export interface ColorOperationProvider {
  prepare(operation: ColorOperation): Promise<PreparedColorPatch>;
  patch(
    identity: ColorOperationIdentity,
    prepared: PreparedColorPatch
  ): Promise<void>;
  // Only the adapter knows provider error shape. It must not blanket-catch errors.
  isPreconditionFailure(error: unknown): boolean;
  read(identity: ColorOperationIdentity): Promise<ProviderColorSnapshot>;
}
export interface ColorOperationAccess {
  // Reauthorize manage_calendar, owner and exact identity for EACH invocation.
  assertAllowed(identity: ColorOperationIdentity): Promise<void>;
}
