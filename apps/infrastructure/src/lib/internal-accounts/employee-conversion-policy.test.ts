import { describe, expect, it } from 'vitest';
import { evaluateEmployeeConversion } from './employee-conversion-policy';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const OPERATION = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';
function fixture() {
  const account = {
    authUserId: USER,
    email: 'person@xwf.tuturuuu.com',
    providerFingerprint: 'provider-before',
    registryRevision: 8,
    immutableStateFingerprint: 'uuid-memberships-roles-content-history',
  };
  return {
    operationId: OPERATION,
    now: 1000,
    authority: {
      actorId: ACTOR,
      verifiedRootAdministrator: true,
      revision: 2,
      expectedRevision: 2,
      expiresAt: 2000,
      revoked: false,
    },
    lease: {
      id: LEASE,
      ownerActorId: ACTOR,
      fencingToken: 3,
      expectedFencingToken: 3,
      expiresAt: 2000,
    },
    expected: { ...account },
    current: { ...account },
    destination: 'person@tuturuuu.com',
    target: { kind: 'absent' },
  };
}

describe('pure employee conversion policy, without account or provider effects', () => {
  it('binds managed conversion to the existing UUID and immutable ownership snapshot', () => {
    const decision = evaluateEmployeeConversion(fixture());
    expect(decision.kind).toBe('eligible');
    if (decision.kind !== 'eligible')
      throw new Error('Expected eligible fixture');
    expect(decision.intent).toMatchObject({
      authUserId: USER,
      actorId: ACTOR,
      sourceAddress: 'person@xwf.tuturuuu.com',
      destinationAddress: 'person@tuturuuu.com',
      registryRevision: 8,
      authorityRevision: 2,
      leaseId: LEASE,
      fencingToken: 3,
      immutableStateFingerprint: 'uuid-memberships-roles-content-history',
    });
    expect(Object.isFrozen(decision.intent)).toBe(true);
    expect(decision.intent.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('never merges matching localparts owned by different Auth identities', () => {
    expect(
      evaluateEmployeeConversion({
        ...fixture(),
        target: { kind: 'owned', authUserId: OTHER },
      })
    ).toEqual({ kind: 'conflict', reason: 'target_owned_by_another_identity' });
  });
  it.each([
    ['authUserId', OTHER, 'identity_changed'],
    ['email', 'another@xwf.tuturuuu.com', 'source_changed'],
    ['providerFingerprint', 'new-provider', 'provider_changed'],
    ['registryRevision', 9, 'registry_changed'],
    [
      'immutableStateFingerprint',
      'roles-or-memberships-changed',
      'immutable_state_changed',
    ],
  ])(
    'rejects changed %s rather than replacing history',
    (field, value, reason) => {
      const input = fixture();
      expect(
        evaluateEmployeeConversion({
          ...input,
          current: { ...input.current, [field]: value },
        })
      ).toEqual({ kind: 'conflict', reason });
    }
  );
  it('denies external source identities and non-root target domains', () => {
    const input = fixture();
    const external = { ...input.current, email: 'person@example.com' };
    expect(
      evaluateEmployeeConversion({
        ...input,
        current: external,
        expected: external,
      })
    ).toEqual({ kind: 'denied', reason: 'external_source' });
    for (const destination of [
      'person@xwf.tuturuuu.com',
      'person@tuturuuu.com.example',
      'person@tutur3u.com',
    ]) {
      expect(evaluateEmployeeConversion({ ...input, destination })).toEqual({
        kind: 'denied',
        reason: 'destination_not_root',
      });
    }
  });
  it('requires freshly verified target ownership, including already-canonical accounts', () => {
    const input = fixture();
    expect(
      evaluateEmployeeConversion({ ...input, target: { kind: 'unknown' } })
    ).toEqual({ kind: 'denied', reason: 'target_unverified' });
    const account = { ...input.current, email: input.destination };
    expect(
      evaluateEmployeeConversion({
        ...input,
        current: account,
        expected: account,
        target: { kind: 'owned', authUserId: USER },
      })
    ).toEqual({ kind: 'already_canonical', authUserId: USER });
    expect(
      evaluateEmployeeConversion({
        ...input,
        current: account,
        expected: account,
      })
    ).toEqual({ kind: 'denied', reason: 'target_unverified' });
  });
  it('checks operation binding before an already-canonical observation', () => {
    const input = fixture();
    const account = { ...input.current, email: input.destination };
    const canonical = {
      ...input,
      current: account,
      expected: account,
      target: { kind: 'owned', authUserId: USER },
    };
    // Literal SHA-256 of the canonical fixture's ordered immutable intent.
    const payloadHash =
      'f9b9f6b9abdc51916a80b840e98582d1beb50605fd96effabad441943bd6776e';
    const validOperation = { operationId: OPERATION, payloadHash };
    expect(
      evaluateEmployeeConversion({
        ...canonical,
        priorOperation: validOperation,
      })
    ).toEqual({ kind: 'already_canonical', authUserId: USER });
    for (const priorOperation of [
      { ...validOperation, operationId: OTHER },
      { ...validOperation, payloadHash: '0'.repeat(64) },
    ]) {
      expect(
        evaluateEmployeeConversion({ ...canonical, priorOperation })
      ).toEqual({ kind: 'conflict', reason: 'operation_payload_changed' });
    }
    expect(evaluateEmployeeConversion(canonical)).toEqual({
      kind: 'already_canonical',
      authUserId: USER,
    });
  });

  it('denies revoked, expired, unverified and changed administrator authority', () => {
    const input = fixture();
    for (const change of [
      { revoked: true },
      { expiresAt: 1000 },
      { verifiedRootAdministrator: false },
      { revision: 3 },
    ]) {
      expect(
        evaluateEmployeeConversion({
          ...input,
          authority: { ...input.authority, ...change },
        })
      ).toEqual({ kind: 'denied', reason: 'administrator_unavailable' });
    }
  });
  it('denies stale fences, expired leases and foreign owners', () => {
    const input = fixture();
    for (const change of [
      { fencingToken: 4 },
      { expiresAt: 1000 },
      { ownerActorId: OTHER },
    ]) {
      expect(
        evaluateEmployeeConversion({
          ...input,
          lease: { ...input.lease, ...change },
        })
      ).toEqual({ kind: 'denied', reason: 'lease_unavailable' });
    }
  });
  it('binds logical operation replay to the exact immutable payload', () => {
    const input = fixture();
    const initial = evaluateEmployeeConversion(input);
    if (initial.kind !== 'eligible')
      throw new Error('Expected eligible fixture');
    const priorOperation = {
      operationId: OPERATION,
      payloadHash: initial.intent.payloadHash,
    };
    expect(evaluateEmployeeConversion({ ...input, priorOperation })).toEqual({
      ...initial,
      replay: true,
    });
    expect(
      evaluateEmployeeConversion({
        ...input,
        destination: 'other@tuturuuu.com',
        priorOperation,
      })
    ).toEqual({ kind: 'conflict', reason: 'operation_payload_changed' });
    expect(
      evaluateEmployeeConversion({
        ...input,
        priorOperation: { ...priorOperation, operationId: OTHER },
      })
    ).toEqual({ kind: 'conflict', reason: 'operation_payload_changed' });
  });
  it('rejects extra authority, invalid IDs and missing snapshot fields', () => {
    expect(
      evaluateEmployeeConversion({ ...fixture(), grantAdministrator: true })
    ).toEqual({ kind: 'denied', reason: 'invalid_input' });
    expect(
      evaluateEmployeeConversion({ ...fixture(), operationId: 'unsafe-id' })
    ).toEqual({ kind: 'denied', reason: 'invalid_input' });
    expect(evaluateEmployeeConversion({ ...fixture(), expected: {} })).toEqual({
      kind: 'denied',
      reason: 'invalid_input',
    });
  });
});
