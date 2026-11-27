import {
  type GenerationAttempt,
  type GenerationKey,
  type GenerationProvider,
  type GenerationRequest,
  generationLimits,
} from '@tuturuuu/worlds/generation';

export const worldsProviderLimits = {
  textBytes: 16 * 1024,
  imageBytes: 1024 * 1024,
  imageSide: 1024,
  inputOverheadTokens: 4096,
  outputTokens: 4096,
  outputBytes: 64 * 1024,
  reserveCredits: 100,
  timeoutMs: 25_000,
} as const;

export interface WorldsGenerationScope {
  workspaceId: string;
  worldId: string;
  actorId: string;
}

export type WorldsUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type WorldsInput = {
  instruction: string;
  attachment?:
    | { kind: 'text'; text: string }
    | { kind: 'image'; data: Uint8Array };
  estimatedInputTokens: number;
};

type LedgerKey = GenerationKey & { actorId: string; attempt: number };

/**
 * A server-owned ledger sharing the job's authorization and cancellation boundary.
 * Every write checks the full binding. Claim uniquely fences the job key across
 * all attempts, atomically checks actor, active revision and cancellation, and
 * may never be reclaimed for dispatch. A timeout or UNKNOWN result retains it.
 */
export interface WorldsDispatchLedger {
  claim(key: LedgerKey, signal: AbortSignal): Promise<boolean>;
  recordReservation(
    key: LedgerKey,
    reservationId: string,
    signal: AbortSignal
  ): Promise<void>;
  recordUsage(
    key: LedgerKey,
    reservationId: string,
    usage: WorldsUsage
  ): Promise<void>;
}

export interface WorldsProviderDependencies {
  ledger: WorldsDispatchLedger;
  reserve(
    scope: WorldsGenerationScope,
    key: LedgerKey,
    input: WorldsInput,
    signal: AbortSignal
  ): Promise<{
    id: string;
    modelId: string;
    maxOutputTokens: number;
  } | null>;
  generate(
    input: WorldsInput & {
      modelId: string;
      maxOutputTokens: number;
      worldId: string;
      signal: AbortSignal;
    }
  ): Promise<{ draft: unknown; usage: WorldsUsage }>;
  settle(
    scope: WorldsGenerationScope,
    reservationId: string,
    usage: WorldsUsage
  ): Promise<boolean>;
  release(scope: WorldsGenerationScope, reservationId: string): Promise<void>;
}

export function matchesWorldsScope(
  scope: WorldsGenerationScope,
  request: GenerationKey
) {
  return (
    scope.workspaceId === request.workspaceId &&
    scope.worldId === request.worldId
  );
}

function boundedInput(
  request: GenerationRequest,
  bytes?: Uint8Array
): WorldsInput | null {
  const { instruction } = request;
  if (
    typeof instruction !== 'string' ||
    !instruction.trim() ||
    instruction.length > generationLimits.instructionLength
  )
    return null;

  const input = {
    instruction,
    estimatedInputTokens:
      worldsProviderLimits.inputOverheadTokens +
      new TextEncoder().encode(instruction).byteLength,
  };
  if (request.kind === 'prompt') return bytes === undefined ? input : null;
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== request.source.byteLength ||
    bytes.length === 0
  )
    return null;

  if (request.kind === 'image') {
    if (
      request.source.mediaType !== 'image/png' ||
      bytes.length < 33 ||
      bytes.length > worldsProviderLimits.imageBytes
    )
      return null;
    const header = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );
    if (
      header.getUint32(0) !== 0x89504e47 ||
      header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 ||
      header.getUint32(12) !== 0x49484452
    )
      return null;
    const { imageSide } = worldsProviderLimits;
    const width = header.getUint32(16);
    const height = header.getUint32(20);
    if (!width || !height || width > imageSide || height > imageSide)
      return null;
    return {
      ...input,
      attachment: { kind: 'image', data: bytes },
      estimatedInputTokens:
        input.estimatedInputTokens + worldsProviderLimits.inputOverheadTokens,
    };
  }

  if (
    !['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(
      request.source.mediaType
    ) ||
    bytes.length > worldsProviderLimits.textBytes
  )
    return null;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.includes('\0')) return null;
    return {
      ...input,
      attachment: { kind: 'text', text: decoded },
      estimatedInputTokens: input.estimatedInputTokens + bytes.length,
    };
  } catch {
    return null;
  }
}

function validUsage({
  inputTokens,
  outputTokens,
  reasoningTokens,
}: WorldsUsage) {
  return (
    [inputTokens, outputTokens, reasoningTokens].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647
    ) &&
    (inputTokens > 0 || outputTokens > 0) &&
    reasoningTokens <= outputTokens
  );
}

const failed = { kind: 'failure', retryable: false } as const;

/** The caller binds authorization to a claimed job, never to client-supplied identity. */
export function createWorldsGenerationProvider(
  scope: WorldsGenerationScope,
  dependencies: WorldsProviderDependencies
): GenerationProvider {
  return {
    async generate(
      { request, attempt, signal: jobSignal }: GenerationAttempt,
      bytes
    ) {
      const signal = AbortSignal.any([
        jobSignal,
        AbortSignal.timeout(worldsProviderLimits.timeoutMs),
      ]);
      if (
        signal.aborted ||
        !matchesWorldsScope(scope, request) ||
        !Number.isSafeInteger(attempt) ||
        attempt < 1 ||
        attempt > generationLimits.attempts
      )
        return failed;
      const input = boundedInput(request, bytes);
      if (!input) return failed;

      const { workspaceId, worldId, requestId } = request;
      const key = {
        workspaceId,
        worldId,
        requestId,
        actorId: scope.actorId,
        attempt,
      };
      let reservation: Awaited<
        ReturnType<WorldsProviderDependencies['reserve']>
      > = null;
      let dispatched = false;
      try {
        if (!(await dependencies.ledger.claim(key, signal))) return failed;
        signal.throwIfAborted();
        reservation = await dependencies.reserve(scope, key, input, signal);
        if (!reservation) return failed;
        signal.throwIfAborted();
        await dependencies.ledger.recordReservation(
          key,
          reservation.id,
          signal
        );
        signal.throwIfAborted();
        if (
          !Number.isSafeInteger(reservation.maxOutputTokens) ||
          reservation.maxOutputTokens < 1 ||
          reservation.maxOutputTokens > worldsProviderLimits.outputTokens
        )
          return failed;
        dispatched = true;
        const { draft, usage } = await dependencies.generate({
          ...input,
          modelId: reservation.modelId,
          maxOutputTokens: reservation.maxOutputTokens,
          worldId,
          signal,
        });
        if (!validUsage(usage)) return failed;
        // Meter work that the provider has reported, including invalid or cancelled drafts.
        await dependencies.ledger.recordUsage(key, reservation.id, usage);
        const settled = await dependencies.settle(scope, reservation.id, usage);
        return settled && !signal.aborted ? { kind: 'draft', draft } : failed;
      } catch {
        // An ambiguous dispatch or settlement stays fenced for reconciliation.
        return failed;
      } finally {
        if (reservation && !dispatched) {
          await dependencies
            .release(scope, reservation.id)
            .catch(() => undefined);
        }
      }
    },
  };
}
