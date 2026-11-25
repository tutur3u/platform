/**
 * Runtime-independent ports for platform storage providers.
 *
 * The policy service admits one operation and hands the backend adapter a
 * narrowly scoped capability. Adapters work on exact canonical keys and
 * report failures as one of the normalized classes below. The index owns
 * listing, metadata, usage totals and state transitions, so user-facing
 * operations never receive raw bucket handles or provider list scans.
 *
 * These are type-only contracts: nothing here selects a backend or changes
 * how the workspace storage provider resolves today.
 */

/** Canonical object key inside a logical bucket, already normalized. */
export type CanonicalStorageKey = string & {
  readonly __brand: 'CanonicalStorageKey';
};

/** Logical bucket name, for example `workspaces` or `forms-respondent-uploads`. */
export type LogicalStorageBucket = string & {
  readonly __brand: 'LogicalStorageBucket';
};

/** Opaque, per-object generation used for conditional writes and deletes. */
export type StorageObjectGeneration = string & {
  readonly __brand: 'StorageObjectGeneration';
};

/**
 * Physical backend identity. Existing per-workspace R2 Drive configuration
 * stays distinct from the platform-owned R2 buckets.
 */
export type StorageBackendIdentity =
  | { readonly kind: 'supabase' }
  | { readonly kind: 'r2-platform'; readonly physicalBucket: string }
  | { readonly kind: 'r2-workspace'; readonly workspaceId: string };

export type StorageBackendKind = StorageBackendIdentity['kind'];

/** Intents admitted against one exact key. */
export type StorageObjectIntent =
  | 'read'
  | 'head'
  | 'write'
  | 'delete'
  | 'sign-read'
  | 'sign-write';

/** Object intents plus `list`, which is admitted against a key prefix. */
export type StorageOperationIntent = StorageObjectIntent | 'list';

/** Verified actor or narrowly scoped service capability asking to operate. */
export type StoragePolicyPrincipal =
  | { readonly kind: 'user'; readonly userId: string }
  | {
      readonly kind: 'service';
      readonly service: string;
      readonly scope: string;
    }
  | { readonly kind: 'anonymous-grant'; readonly grantId: string };

/** What an operation targets: one exact key, or a prefix for listing. */
export type StoragePolicyTarget =
  | {
      readonly scope: 'object';
      readonly key: CanonicalStorageKey;
      readonly intent: StorageObjectIntent;
      /**
       * Conditional when not undefined: a generation must match, and `null`
       * means the key must not exist yet. Omitting it makes a write or delete
       * UNCONDITIONAL: it overwrites or removes whatever the key holds.
       */
      readonly expectedGeneration?: StorageObjectGeneration | null;
    }
  | {
      readonly scope: 'prefix';
      readonly prefix: CanonicalStorageKey;
      readonly intent: 'list';
    };

export type StoragePolicyInput = {
  readonly principal: StoragePolicyPrincipal;
  readonly logicalBucket: LogicalStorageBucket;
} & StoragePolicyTarget;

interface StorageCapabilityBase {
  readonly backend: StorageBackendIdentity;
  readonly logicalBucket: LogicalStorageBucket;
  /** Workspace derived from the route and owning domain, never the caller. */
  readonly workspaceId: string | null;
  /** Expiry as Unix epoch milliseconds. */
  readonly expiresAt: number;
}

/**
 * Capability issued by the policy service for one admitted operation on one
 * exact key, admitted for exactly one intent.
 */
export interface StorageObjectCapabilityOf<
  I extends StorageObjectIntent,
> extends StorageCapabilityBase {
  readonly scope: 'object';
  readonly key: CanonicalStorageKey;
  readonly intent: I;
  /**
   * Conditional when not undefined: a generation must match, and `null`
   * means the key must not exist yet. Omitting it makes a write or delete
   * UNCONDITIONAL: it overwrites or removes whatever the key holds.
   */
  readonly expectedGeneration?: StorageObjectGeneration | null;
}

/**
 * Object capability for any of the intents in `I`, as a union with one member
 * per intent. Checking `capability.intent` narrows it to the member an adapter
 * method accepts, so a capability admitted for one intent cannot run another
 * and needs no cast once narrowed.
 */
export type StorageObjectCapability<
  I extends StorageObjectIntent = StorageObjectIntent,
> = I extends StorageObjectIntent ? StorageObjectCapabilityOf<I> : never;

/** Capability to list or total one admitted key prefix through the index. */
export interface StoragePrefixCapability extends StorageCapabilityBase {
  readonly scope: 'prefix';
  readonly prefix: CanonicalStorageKey;
  readonly intent: 'list';
}

/**
 * Any capability the policy service can issue. Callers never hold bucket
 * handles; adapters and the index accept nothing broader than these.
 */
export type StorageBackendCapability =
  | StorageObjectCapability
  | StoragePrefixCapability;

export type StoragePolicyDenialReason =
  | 'unauthenticated'
  | 'forbidden'
  | 'reserved-key'
  | 'not-found'
  | 'quota-exceeded'
  | 'grant-revoked';

export type StoragePolicyDecision =
  | { readonly admitted: true; readonly capability: StorageBackendCapability }
  | { readonly admitted: false; readonly reason: StoragePolicyDenialReason };

export interface StoragePolicyService {
  admit(input: StoragePolicyInput): Promise<StoragePolicyDecision>;
}

/** Normalized adapter failure classes. Only `origin-absence` may allow fallback. */
export type StorageFailureClass =
  | 'origin-absence'
  | 'version-conflict'
  | 'denied'
  | 'transient'
  | 'configuration'
  | 'integrity';

export interface StorageBackendFailure {
  readonly class: StorageFailureClass;
  readonly backend: StorageBackendKind;
  /** Sanitized description; never includes credentials or signed URLs. */
  readonly message: string;
}

export type StorageBackendResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: StorageBackendFailure };

export interface StorageObjectHead {
  readonly key: CanonicalStorageKey;
  readonly size: number;
  readonly contentType: string | null;
  readonly generation: StorageObjectGeneration;
  readonly sha256: string | null;
  readonly updatedAt: string | null;
}

export interface StorageByteRange {
  readonly start: number;
  /** Inclusive end offset; omitted reads to the end of the object. */
  readonly end?: number;
}

export interface StorageObjectStream {
  readonly head: StorageObjectHead;
  readonly range: StorageByteRange | null;
  readonly body: ReadableStream<Uint8Array>;
}

export interface StoragePutInput {
  readonly body: ReadableStream<Uint8Array> | Uint8Array;
  readonly contentType: string;
  readonly contentLength: number;
  readonly sha256?: string;
}

/**
 * One signature for one HTTP method. The method follows the capability's
 * intent: `sign-read` signs only GET and `sign-write` signs only PUT.
 */
export type StorageSignRequest =
  | {
      readonly capability: StorageObjectCapability<'sign-read'>;
      readonly method: 'GET';
      readonly expiresInSeconds: number;
    }
  | {
      readonly capability: StorageObjectCapability<'sign-write'>;
      readonly method: 'PUT';
      readonly expiresInSeconds: number;
      readonly contentType?: string;
      readonly contentLength?: number;
    };

export interface StorageSignedRequest {
  readonly method: StorageSignRequest['method'];
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Expiry as Unix epoch milliseconds. */
  readonly expiresAt: number;
}

/**
 * Exact-key backend adapter. Prefix scans are not part of this port; see
 * {@link StorageMigrationScanner}. Moves are journal operations composed of a
 * source read, a destination write and source retirement.
 */
export interface StorageBackendAdapter {
  readonly backend: StorageBackendIdentity;
  head(
    capability: StorageObjectCapability<'head' | 'read'>
  ): Promise<StorageBackendResult<StorageObjectHead>>;
  read(
    capability: StorageObjectCapability<'read'>,
    range?: StorageByteRange
  ): Promise<StorageBackendResult<StorageObjectStream>>;
  /**
   * Conditional when `capability.expectedGeneration` is not undefined; `null`
   * means the key must not exist yet. Without it the operation is
   * UNCONDITIONAL.
   */
  put(
    capability: StorageObjectCapability<'write'>,
    input: StoragePutInput
  ): Promise<StorageBackendResult<StorageObjectHead>>;
  /**
   * Conditional when `capability.expectedGeneration` is not undefined; `null`
   * means the key must not exist yet. Without it the operation is
   * UNCONDITIONAL.
   */
  delete(
    capability: StorageObjectCapability<'delete'>
  ): Promise<StorageBackendResult<{ readonly deleted: boolean }>>;
  sign(
    request: StorageSignRequest
  ): Promise<StorageBackendResult<StorageSignedRequest>>;
}

export interface StorageScanPage {
  readonly entries: readonly StorageObjectHead[];
  readonly cursor: string | null;
}

/** Provider prefix scans, reserved for migration and reconciliation jobs. */
export interface StorageMigrationScanner {
  readonly backend: StorageBackendIdentity;
  scan(input: {
    readonly logicalBucket: LogicalStorageBucket;
    readonly prefix: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<StorageBackendResult<StorageScanPage>>;
}

export type StorageIndexEntryState = 'pending' | 'live' | 'tombstoned';

export interface StorageIndexEntry {
  readonly logicalBucket: LogicalStorageBucket;
  readonly key: CanonicalStorageKey;
  readonly state: StorageIndexEntryState;
  readonly generation: StorageObjectGeneration;
  readonly backend: StorageBackendKind;
  readonly size: number;
  readonly contentType: string | null;
  readonly sha256: string | null;
  readonly updatedAt: string;
}

export interface StorageIndexPage {
  readonly entries: readonly StorageIndexEntry[];
  readonly cursor: string | null;
}

export interface StorageIndexTransition {
  /** Retries with the same key apply at most once. */
  readonly idempotencyKey: string;
  readonly logicalBucket: LogicalStorageBucket;
  readonly key: CanonicalStorageKey;
  /** `null` means the key must not have an index entry yet. */
  readonly expectedGeneration: StorageObjectGeneration | null;
  readonly next: Pick<
    StorageIndexEntry,
    'state' | 'generation' | 'backend' | 'size' | 'contentType' | 'sha256'
  >;
}

export type StorageIndexTransitionResult =
  | { readonly applied: true; readonly entry: StorageIndexEntry }
  | {
      readonly applied: false;
      readonly reason: 'version-conflict' | 'tombstoned';
      readonly current: StorageIndexEntry | null;
    };

export interface StorageUsageTotals {
  readonly fileCount: number;
  readonly totalBytes: number;
}

export type StorageReconciliationInput =
  | { readonly kind: 'snapshot'; readonly page: StorageScanPage }
  | {
      readonly kind: 'delta';
      readonly watermark: string;
      readonly changes: readonly StorageIndexTransition[];
    };

export interface StorageReconciliationReport {
  readonly watermark: string;
  readonly matched: number;
  readonly missingInIndex: number;
  readonly missingInBackend: number;
  readonly mismatched: number;
}

/**
 * Authorized index over logical buckets. Every read takes a capability from
 * policy admission; internal marker keys never appear in its pages.
 */
export interface StorageIndexPort {
  listPrefix(input: {
    readonly capability: StoragePrefixCapability;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<StorageIndexPage>;
  getEntry(
    capability: StorageObjectCapability<'head' | 'read'>
  ): Promise<StorageIndexEntry | null>;
  usageTotals(capability: StoragePrefixCapability): Promise<StorageUsageTotals>;
  transition(
    input: StorageIndexTransition
  ): Promise<StorageIndexTransitionResult>;
  reconcile(
    input: StorageReconciliationInput
  ): Promise<StorageReconciliationReport>;
}
