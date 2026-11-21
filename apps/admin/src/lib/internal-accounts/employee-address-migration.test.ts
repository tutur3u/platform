import { describe, expect, it } from 'vitest';
import {
  inspectEmployeeAddressMigration,
  migrateEmployeeAddress,
} from './employee-address-migration';
import type {
  AddressMigrationPorts,
  AddressMigrationRequest,
  MigrationBinding,
  MigrationInspection,
  MigrationProviderObservation,
  MigrationRecord,
} from './employee-address-migration-contract';
import { sameMigrationBinding } from './employee-address-migration-contract';

const actorId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const operationId = '00000000-0000-4000-8000-000000000003';
const attemptId = '00000000-0000-4000-8000-000000000004';
const otherId = '00000000-0000-4000-8000-000000000005';
const request: AddressMigrationRequest = {
  actorId,
  userId,
  operationId,
  expectedRevision: 4,
  sourceAddress: 'person@xwf.tuturuuu.com',
  destinationAddress: 'person@tuturuuu.com',
};
const pending = { status: 'pending', operationId, nextAction: 'inspect' };

// Deliberately an in-memory protocol fixture, not durable SQL/provider proof.
function fixture(initialRevision = 4) {
  let record: MigrationRecord | null = null;
  let writes = 0;
  let completeCalls = 0;
  let revision = initialRevision;
  let authorized = true;
  let ownership: MigrationInspection['addressOwnership'] = 'available';
  let immutableFingerprint = 'a'.repeat(64);
  let current: MigrationProviderObservation = {
    userId,
    email: request.sourceAddress,
    emailVerified: true,
    active: true,
    providerIdentityFingerprint: 'b'.repeat(64),
  };
  const ports: AddressMigrationPorts = {
    newAttemptId: () => attemptId,
    journal: {
      async inspect() {
        return structuredClone({
          authorized,
          revision,
          immutableFingerprint,
          providerIdentityFingerprint: 'b'.repeat(64),
          sourceVerified: true,
          addressOwnership: ownership,
          record,
        });
      },
      async reserve(binding) {
        if (record && !sameMigrationBinding(record.binding, binding))
          throw Error('Conflict');
        record ??= { binding, phase: 'reserved', attemptId: null };
      },
      async claimAttempt(binding, claimId) {
        if (
          record?.phase !== 'reserved' ||
          !sameMigrationBinding(record.binding, binding)
        )
          return false;
        record = { binding, phase: 'attempted', attemptId: claimId };
        return true;
      },
      async complete(binding) {
        completeCalls++;
        if (
          !record ||
          !authorized ||
          current.email !== binding.destinationAddress ||
          !current.emailVerified ||
          immutableFingerprint !== binding.immutableFingerprint
        )
          throw Error('Unverified');
        if (record.phase !== 'completed') revision++;
        record = { ...record, phase: 'completed' };
      },
    },
    provider: {
      async read() {
        return structuredClone(current);
      },
      async changeEmail(id, email) {
        expect(id).toBe(userId);
        expect(email).toBe(request.destinationAddress);
        writes++;
        current = { ...current, email };
      },
    },
  };
  return {
    ports,
    writes: () => writes,
    completeCalls: () => completeCalls,
    record: () => record,
    setRecord(value: MigrationRecord) {
      record = value;
    },
    setProvider(value: Partial<MigrationProviderObservation>) {
      current = { ...current, ...value };
    },
    revoke() {
      authorized = false;
    },
    conflict(value: MigrationInspection['addressOwnership']) {
      ownership = value;
    },
    mutateImmutable() {
      immutableFingerprint = 'c'.repeat(64);
    },
    binding(): MigrationBinding {
      return {
        ...request,
        immutableFingerprint: 'a'.repeat(64),
        providerIdentityFingerprint: 'b'.repeat(64),
      };
    },
  };
}

describe('unbound stable-UUID address migration protocol', () => {
  it('changes only the email of the original identity after committed attempt readback', async () => {
    const f = fixture();
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual({
      status: 'completed',
      operationId,
      userId,
      email: request.destinationAddress,
    });
    expect(f.writes()).toBe(1);
    expect(f.record()?.binding.userId).toBe(userId);
    expect(f.record()?.phase).toBe('completed');
    expect(await migrateEmployeeAddress(f.ports, request)).toMatchObject({
      status: 'completed',
    });
    expect(f.writes()).toBe(1);
    expect(f.completeCalls()).toBe(1);
  });
  it.each([
    { actorId: userId },
    { sourceAddress: 'person@tuturuuu.com' },
    { sourceAddress: 'person@evil-tuturuuu.com' },
    { sourceAddress: 'person@tuturuuu.com.evil.test' },
    { sourceAddress: 'Person@xwf.tuturuuu.com' },
    { destinationAddress: 'other@tuturuuu.com' },
    { destinationAddress: 'person@other.tuturuuu.com' },
    { destinationAddress: 'person@TUTURUUU.COM' },
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { grantAdmin: true },
  ])(
    'denies malformed, self, external or expanded tuple %j before effects',
    async (change) => {
      const f = fixture();
      expect(
        await migrateEmployeeAddress(f.ports, { ...request, ...change })
      ).toEqual({ status: 'denied', code: 'invalid_input' });
      expect(f.record()).toBeNull();
      expect(f.writes()).toBe(0);
    }
  );
  it.each(['unknown', 'conflict'] as const)(
    'denies %s ownership/reservations',
    async (ownership) => {
      const f = fixture();
      f.conflict(ownership);
      expect(await migrateEmployeeAddress(f.ports, request)).toEqual({
        status: 'denied',
        code: 'not_ready',
      });
      expect(f.record()).toBeNull();
    }
  );
  it('denies revoked actors and unconfirmed source identities', async () => {
    const revoked = fixture();
    revoked.revoke();
    expect(await migrateEmployeeAddress(revoked.ports, request)).toEqual({
      status: 'denied',
      code: 'forbidden',
    });
    const unverified = fixture();
    unverified.setProvider({ emailVerified: false });
    expect(await migrateEmployeeAddress(unverified.ports, request)).toEqual({
      status: 'denied',
      code: 'not_ready',
    });
    expect(unverified.writes()).toBe(0);
  });
  it('rejects mixed-case UUID identity aliases before effects', async () => {
    const f = fixture();
    const identity = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      await migrateEmployeeAddress(f.ports, {
        ...request,
        actorId: identity.toUpperCase(),
        userId: identity,
      })
    ).toEqual({ status: 'denied', code: 'invalid_input' });
    expect(f.record()).toBeNull();
  });
  it('completes and replays the largest accepted revision', async () => {
    const revision = Number.MAX_SAFE_INTEGER - 1;
    const f = fixture(revision);
    const input = { ...request, expectedRevision: revision };
    expect(await migrateEmployeeAddress(f.ports, input)).toMatchObject({
      status: 'completed',
    });
    expect(await inspectEmployeeAddressMigration(f.ports, input)).toMatchObject(
      { status: 'completed' }
    );
    expect(f.writes()).toBe(1);
  });
  it('inspects a committed completion after its acknowledgement is lost', async () => {
    const f = fixture();
    const complete = f.ports.journal.complete;
    f.ports.journal.complete = async (binding) => {
      await complete(binding);
      throw Error('Lost response');
    };
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.record()?.phase).toBe('completed');
    expect(
      await inspectEmployeeAddressMigration(f.ports, request)
    ).toMatchObject({ status: 'completed' });
    expect(f.writes()).toBe(1);
    expect(f.completeCalls()).toBe(1);
  });
  it.each(['authorization', 'reservation', 'immutable', 'provider'] as const)(
    'rechecks %s after the durable claim before sending',
    async (boundary) => {
      const f = fixture();
      const claim = f.ports.journal.claimAttempt;
      f.ports.journal.claimAttempt = async (binding, id) => {
        const result = await claim(binding, id);
        if (boundary === 'authorization') f.revoke();
        if (boundary === 'reservation') f.conflict('conflict');
        if (boundary === 'immutable') f.mutateImmutable();
        if (boundary === 'provider')
          f.setProvider({ email: 'changed@xwf.tuturuuu.com' });
        return result;
      };
      expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
      expect(f.writes()).toBe(0);
    }
  );
  it('requires independent reservation readback even when reserve acknowledges', async () => {
    const f = fixture();
    f.ports.journal.reserve = async () => ({ ok: true });
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.writes()).toBe(0);
  });
  it('never launches after a committed reservation loses acknowledgement', async () => {
    const f = fixture();
    const reserve = f.ports.journal.reserve;
    f.ports.journal.reserve = async (binding) => {
      await reserve(binding);
      throw Error('Lost response');
    };
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.writes()).toBe(0);
  });
  it('never launches after an attempt marker loses acknowledgement', async () => {
    const f = fixture();
    const claim = f.ports.journal.claimAttempt;
    f.ports.journal.claimAttempt = async (binding, id) => {
      await claim(binding, id);
      throw Error('Lost response');
    };
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.record()?.phase).toBe('attempted');
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.writes()).toBe(0);
  });
  it('requires committed attempt state, not merely a true claim response', async () => {
    const f = fixture();
    f.ports.journal.claimAttempt = async () => true;
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.writes()).toBe(0);
  });
  it('fences concurrent claim contenders with distinct attempt IDs to one send', async () => {
    const f = fixture();
    let arrivals = 0;
    let reservedReads = 0;
    let releaseInitial: () => void = () => {};
    let releaseReserved: () => void = () => {};
    const initialBarrier = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    const reservedBarrier = new Promise<void>((resolve) => {
      releaseReserved = resolve;
    });
    const inspect = f.ports.journal.inspect;
    f.ports.journal.inspect = async (input) => {
      const value = await inspect(input);
      if (++arrivals <= 2) {
        if (arrivals === 2) releaseInitial();
        await initialBarrier;
      } else if (++reservedReads <= 2) {
        if (reservedReads === 2) releaseReserved();
        await reservedBarrier;
      }
      return value;
    };
    let attempts = 0;
    f.ports.newAttemptId = () => (++attempts === 1 ? attemptId : otherId);
    await Promise.all([
      migrateEmployeeAddress(f.ports, request),
      migrateEmployeeAddress(f.ports, request),
    ]);
    expect(attempts).toBe(2);
    expect(f.writes()).toBe(1);
    expect(f.record()?.phase).toBe('completed');
  });
  it('retains unknown provider outcomes and reconciles by observation without retry', async () => {
    const f = fixture();
    const update = f.ports.provider.changeEmail;
    f.ports.provider.changeEmail = async (id, email) => {
      await update(id, email);
      throw Error('Lost response');
    };
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.writes()).toBe(1);
    expect(
      await inspectEmployeeAddressMigration(f.ports, request)
    ).toMatchObject({ status: 'completed' });
    expect(f.writes()).toBe(1);
  });
  it('does not confirm a pending verification challenge or changed provider identity', async () => {
    for (const mutation of [
      { emailVerified: false },
      { providerIdentityFingerprint: 'c'.repeat(64) },
      { userId: otherId },
    ]) {
      const f = fixture();
      const update = f.ports.provider.changeEmail;
      f.ports.provider.changeEmail = async (id, email) => {
        await update(id, email);
        f.setProvider(mutation);
      };
      expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
      expect(f.completeCalls()).toBe(0);
      expect(f.writes()).toBe(1);
    }
  });
  it('requires a separate completed-state readback', async () => {
    const f = fixture();
    f.ports.journal.complete = async () => ({ status: 'completed' });
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.record()?.phase).toBe('attempted');
  });
  it.each(['revision', 'binding', 'provider'] as const)(
    'does not publish success after %s corruption at completion',
    async (field) => {
      const f = fixture();
      const complete = f.ports.journal.complete;
      f.ports.journal.complete = async (binding) => {
        await complete(binding);
        const record = f.record();
        if (!record) throw Error('Missing fixture record');
        if (field === 'revision')
          f.setRecord({
            ...record,
            binding: { ...record.binding, expectedRevision: 3 },
          });
        if (field === 'binding')
          f.setRecord({
            ...record,
            binding: { ...record.binding, actorId: otherId },
          });
        if (field === 'provider') f.setProvider({ emailVerified: false });
      };
      expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
      expect(f.writes()).toBe(1);
    }
  );
  it('rejects tuple substitution and never replaces a retained operation', async () => {
    const f = fixture();
    f.setRecord({ binding: f.binding(), phase: 'attempted', attemptId });
    expect(
      await migrateEmployeeAddress(f.ports, {
        ...request,
        operationId: otherId,
      })
    ).toEqual({ status: 'denied', code: 'conflict' });
    expect(
      await inspectEmployeeAddressMigration(f.ports, {
        ...request,
        actorId: otherId,
      })
    ).toEqual(pending);
    expect(f.writes()).toBe(0);
  });
  it('does not complete after immutable membership/data state changes', async () => {
    const f = fixture();
    const update = f.ports.provider.changeEmail;
    f.ports.provider.changeEmail = async (id, email) => {
      await update(id, email);
      f.mutateImmutable();
    };
    expect(await migrateEmployeeAddress(f.ports, request)).toEqual(pending);
    expect(f.completeCalls()).toBe(0);
  });
  it('inspects reserved operations without claiming, sending or replacing them', async () => {
    const f = fixture();
    f.setRecord({ binding: f.binding(), phase: 'reserved', attemptId: null });
    expect(await inspectEmployeeAddressMigration(f.ports, request)).toEqual(
      pending
    );
    expect(f.record()?.phase).toBe('reserved');
    expect(f.writes()).toBe(0);
  });
});
