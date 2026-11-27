import type { World } from '../runtime.ts';

export const generationLimits = {
  instructionLength: 4_000,
  objectCount: 2_000,
  spawnCount: 64,
  assetCount: 256,
  mapExtent: 10_000,
  assetBytes: 8 * 1024 * 1024,
  attempts: 3,
  attemptMs: 30_000,
} as const;

export type GenerationKind = 'prompt' | 'image' | 'file';

export interface GenerationKey {
  workspaceId: string;
  worldId: string;
  requestId: string;
}

export interface GenerationSource {
  id: string;
  mediaType: string;
  byteLength: number;
}

export type GenerationRequest = GenerationKey & {
  instruction: string;
} & (
    | { kind: 'prompt' }
    | { kind: 'image' | 'file'; source: Readonly<GenerationSource> }
  );

export type GenerationFailure =
  | 'provider'
  | 'invalid-output'
  | 'input-unavailable'
  | 'attempt-expired';

export type GenerationState =
  | { status: 'queued' }
  | { status: 'running'; expiresAt: number }
  | { status: 'succeeded'; draft: World }
  | { status: 'failed'; reason: GenerationFailure }
  | { status: 'cancelled' };

export interface GenerationJob {
  readonly request: Readonly<GenerationRequest>;
  readonly revision: number;
  readonly attempts: number;
  readonly state: GenerationState;
}

export interface GenerationPersistence {
  read(key: GenerationKey): Promise<GenerationJob | null>;
  /**
   * Atomically insert if absent (expectedRevision null), or replace at the
   * expected revision. Return the committed snapshot or the current winner.
   * Reads and writes must be strongly consistent for the full scoped key.
   */
  compareAndSet(
    expectedRevision: number | null,
    next: GenerationJob
  ): Promise<{ applied: boolean; job: GenerationJob }>;
}

export type ProviderResult =
  | { kind: 'draft'; draft: unknown }
  | { kind: 'failure'; retryable: boolean };

export interface GenerationAttempt {
  readonly request: Readonly<GenerationRequest>;
  /** Together with the full request key, identifies this attempt. */
  readonly attempt: number;
  readonly signal: AbortSignal;
}

export interface GenerationProvider {
  /** Observe the signal, bound output while reading and avoid hidden retries. */
  generate(
    attempt: GenerationAttempt,
    source?: Uint8Array
  ): Promise<ProviderResult>;
}

export interface GenerationAssetStorage {
  /**
   * Resolve an immutable upload scoped to the request's workspace and world.
   * Verify media type and enforce the declared byte limit while reading.
   */
  read(
    attempt: GenerationAttempt,
    source: GenerationSource
  ): Promise<Uint8Array | null>;
}

export interface GenerationDependencies {
  persistence: GenerationPersistence;
  provider: GenerationProvider;
  assets: GenerationAssetStorage;
}
