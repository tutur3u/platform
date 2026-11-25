import { describe, expectTypeOf, it } from 'vitest';
import type {
  CanonicalStorageKey,
  LogicalStorageBucket,
  StorageBackendAdapter,
  StorageBackendCapability,
  StorageBackendFailure,
  StorageBackendResult,
  StorageFailureClass,
  StorageIndexPort,
  StorageObjectCapability,
  StorageObjectCapabilityOf,
  StorageObjectGeneration,
  StorageObjectIntent,
  StorageObjectHead,
  StorageOperationIntent,
  StoragePolicyDecision,
  StoragePolicyInput,
  StoragePolicyService,
  StoragePrefixCapability,
  StorageScanPage,
  StorageSignRequest,
} from './storage-provider-ports';

const key = 'ws/file.txt' as CanonicalStorageKey;
const generation = 'gen-1' as StorageObjectGeneration;
const head: StorageObjectHead = {
  key,
  size: 1,
  contentType: 'text/plain',
  generation,
  sha256: null,
  updatedAt: null,
};

function fail(failureClass: StorageFailureClass): StorageBackendResult<never> {
  return {
    ok: false,
    failure: { class: failureClass, backend: 'supabase', message: 'failed' },
  };
}

function objectCapability<I extends StorageObjectIntent>(
  intent: I
): StorageObjectCapabilityOf<I> {
  return {
    scope: 'object',
    backend: { kind: 'supabase' },
    logicalBucket: 'workspaces' as LogicalStorageBucket,
    workspaceId: 'ws',
    expiresAt: 0,
    key,
    intent,
  };
}

const prefixCapability: StoragePrefixCapability = {
  scope: 'prefix',
  backend: { kind: 'supabase' },
  logicalBucket: 'workspaces' as LogicalStorageBucket,
  workspaceId: 'ws',
  expiresAt: 0,
  prefix: 'ws/' as CanonicalStorageKey,
  intent: 'list',
};

const adapter = {
  backend: { kind: 'supabase' },
  head: async () => ({ ok: true, value: head }),
  read: async () => fail('origin-absence'),
  put: async () => fail('version-conflict'),
  delete: async () => ({ ok: true, value: { deleted: true } }),
  sign: async () => fail('configuration'),
} satisfies StorageBackendAdapter;

declare const port: StorageBackendAdapter;
declare const index: StorageIndexPort;
declare const admitted: StorageBackendCapability;

/**
 * Compile-time only and never invoked: tsc must accept the first block and
 * reject each call marked with an expected error.
 */
function portCallContracts() {
  void port.sign({
    capability: objectCapability('sign-read'),
    method: 'GET',
    expiresInSeconds: 60,
  });
  void port.sign({
    capability: objectCapability('sign-write'),
    method: 'PUT',
    expiresInSeconds: 60,
    contentType: 'text/plain',
  });
  void port.read(objectCapability('read'), { start: 0 });
  void port.head(objectCapability('head'));
  void port.put(objectCapability('write'), {
    body: new Uint8Array(),
    contentType: 'text/plain',
    contentLength: 0,
  });
  void port.delete(objectCapability('delete'));
  void index.usageTotals(prefixCapability);
  void index.listPrefix({
    capability: prefixCapability,
    cursor: null,
    limit: 1,
  });

  // @ts-expect-error a sign-read capability cannot sign a PUT
  void port.sign({
    capability: objectCapability('sign-read'),
    method: 'PUT',
    expiresInSeconds: 60,
  });
  // @ts-expect-error a sign-write capability cannot sign a GET
  void port.sign({
    capability: objectCapability('sign-write'),
    method: 'GET',
    expiresInSeconds: 60,
  });
  // @ts-expect-error a write capability cannot read
  void port.read(objectCapability('write'));
  // @ts-expect-error a read capability cannot delete
  void port.delete(objectCapability('read'));
  // @ts-expect-error usage totals need a prefix capability
  void index.usageTotals(objectCapability('read'));
  const bare = {
    logicalBucket: 'workspaces' as LogicalStorageBucket,
    prefix: 'ws/' as CanonicalStorageKey,
  };
  // @ts-expect-error a branded bucket and prefix still lack capability fields
  void index.usageTotals(bare);
  const cap = objectCapability('read');
  // @ts-expect-error listing needs a prefix capability
  void index.listPrefix({ capability: cap, cursor: null, limit: 1 });
}

/**
 * Compile-time only and never invoked: an admitted capability reaches the
 * matching adapter method once its intent is checked, and not before.
 */
function admittedCapabilityNarrowing() {
  if (admitted.intent === 'read') {
    void port.read(admitted);
    void port.head(admitted);
  }
  if (admitted.intent === 'write') {
    void port.put(admitted, {
      body: new Uint8Array(),
      contentType: 'text/plain',
      contentLength: 0,
    });
  }
  if (admitted.intent === 'delete') void port.delete(admitted);
  if (admitted.intent === 'sign-read') {
    void port.sign({
      capability: admitted,
      method: 'GET',
      expiresInSeconds: 60,
    });
  }
  if (admitted.intent === 'sign-write') {
    void port.sign({
      capability: admitted,
      method: 'PUT',
      expiresInSeconds: 60,
    });
  }
  if (admitted.intent === 'list') void index.usageTotals(admitted);

  // @ts-expect-error an admitted capability must be narrowed before reading
  void port.read(admitted);
  // @ts-expect-error an admitted capability must be narrowed before deleting
  void port.delete(admitted);
  const unnarrowedSign = {
    capability: admitted,
    method: 'GET' as const,
    expiresInSeconds: 60,
  };
  // @ts-expect-error an admitted capability must be narrowed before signing
  void port.sign(unnarrowedSign);
  if (admitted.intent === 'sign-read') {
    const wrongMethod = {
      capability: admitted,
      method: 'PUT' as const,
      expiresInSeconds: 60,
    };
    // @ts-expect-error a narrowed sign-read capability still cannot sign a PUT
    void port.sign(wrongMethod);
  }
}

describe('storage provider ports', () => {
  it('type-checks the accepted and rejected port calls', () => {
    expectTypeOf(portCallContracts).toBeFunction();
    expectTypeOf(admittedCapabilityNarrowing).toBeFunction();
  });

  it('makes object capabilities a union with one member per intent', () => {
    expectTypeOf<StorageObjectCapability>().toEqualTypeOf<
      {
        [I in StorageObjectIntent]: StorageObjectCapabilityOf<I>;
      }[StorageObjectIntent]
    >();
    expectTypeOf<
      Extract<StorageBackendCapability, { intent: 'read' }>
    >().toEqualTypeOf<StorageObjectCapabilityOf<'read'>>();
  });

  it('lets an adapter implement the exact-key backend port', () => {
    expectTypeOf(adapter).toExtend<StorageBackendAdapter>();
    expectTypeOf<keyof StorageBackendAdapter>().toEqualTypeOf<
      'backend' | 'head' | 'read' | 'put' | 'delete' | 'sign'
    >();
  });

  it('keeps provider prefix scans out of the backend and index ports', () => {
    expectTypeOf<StorageBackendAdapter>().not.toHaveProperty('list');
    expectTypeOf<StorageBackendAdapter>().not.toHaveProperty('scan');
    expectTypeOf<StorageIndexPort>().not.toHaveProperty('scan');
    expectTypeOf<StorageScanPage>().toHaveProperty('entries');
    expectTypeOf<StorageScanPage>().not.toHaveProperty('keys');
  });

  it('normalizes failures to the six documented classes', () => {
    expectTypeOf<StorageFailureClass>().toEqualTypeOf<
      | 'origin-absence'
      | 'version-conflict'
      | 'denied'
      | 'transient'
      | 'configuration'
      | 'integrity'
    >();
    expectTypeOf<
      StorageBackendFailure['class']
    >().toEqualTypeOf<StorageFailureClass>();
  });

  it('signs one HTTP method that matches the capability intent', () => {
    expectTypeOf<StorageSignRequest['method']>().toEqualTypeOf<'GET' | 'PUT'>();
    expectTypeOf<
      Extract<StorageSignRequest, { method: 'GET' }>['capability']['intent']
    >().toEqualTypeOf<'sign-read'>();
    expectTypeOf<
      Extract<StorageSignRequest, { method: 'PUT' }>['capability']['intent']
    >().toEqualTypeOf<'sign-write'>();
  });

  it('admits listing only against a prefix capability', () => {
    expectTypeOf<'list'>().toExtend<StorageOperationIntent>();
    expectTypeOf<StoragePrefixCapability['intent']>().toEqualTypeOf<'list'>();
    expectTypeOf<
      Parameters<StorageIndexPort['usageTotals']>[0]
    >().toEqualTypeOf<StoragePrefixCapability>();
    expectTypeOf<
      Parameters<StorageIndexPort['listPrefix']>[0]['capability']
    >().toEqualTypeOf<StoragePrefixCapability>();
    expectTypeOf(prefixCapability).toExtend<StorageBackendCapability>();
  });

  it('issues capabilities only through an admitted policy decision', () => {
    expectTypeOf<StoragePolicyService['admit']>()
      .parameter(0)
      .toEqualTypeOf<StoragePolicyInput>();
    expectTypeOf<
      Extract<StoragePolicyDecision, { admitted: true }>['capability']
    >().toEqualTypeOf<StorageBackendCapability>();
    expectTypeOf<
      Extract<StoragePolicyDecision, { admitted: false }>
    >().not.toHaveProperty('capability');
  });

  it('keeps keys and generations distinct from plain strings', () => {
    expectTypeOf<string>().not.toExtend<CanonicalStorageKey>();
    expectTypeOf<string>().not.toExtend<StorageObjectGeneration>();
    expectTypeOf<StorageObjectCapability>().not.toHaveProperty('bucket');
  });
});
