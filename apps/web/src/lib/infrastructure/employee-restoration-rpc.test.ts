import { createEmployeeRestorationOperations } from '@tuturuuu/utils/internal-accounts/employee-restoration-rpc';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  actor,
  email,
  inspection,
  operationId,
  restorationFixture,
  target,
  tuple,
} from './employee-restoration-test-fixture';

vi.mock('server-only', () => ({}));

let fixture: Awaited<ReturnType<typeof restorationFixture>>;
beforeEach(async () => {
  fixture = await restorationFixture();
});
afterEach(async () => {
  await fixture.close();
});

it('sends fixed tuples and separately observes each committed phase over real loopback HTTP', async () => {
  const operations = createEmployeeRestorationOperations(fixture.transport);
  for (const method of [
    'begin',
    'markAttempt',
    'confirm',
    'reconcile',
  ] as const)
    expect(await operations[method](tuple)).toMatchObject({ error: null });
  expect(fixture.calls.map(({ name }) => name)).toEqual([
    'begin_employee_restore',
    'inspect_employee_management',
    'mark_employee_restore_attempt',
    'inspect_employee_management',
    'confirm_employee_restore',
    'inspect_employee_management',
    'reconcile_employee_restore',
    'inspect_employee_management',
  ]);
  expect(fixture.calls[0]?.body).toEqual({
    p_actor_id: actor,
    p_user_id: target,
    p_email: email,
    p_expected_revision: 0,
    p_operation_id: operationId,
  });
  expect(fixture.calls[1]?.body).toEqual({
    p_actor_id: actor,
    p_user_id: target,
    p_email: email,
  });
});
it.each([
  'unpersisted',
  'missing-readback',
  'stale-readback',
  'rollback',
  'wrong-operation',
])('does not accept a %s begin acknowledgement', async (mode) => {
  fixture.setMode(mode);
  await expect(
    createEmployeeRestorationOperations(fixture.transport).begin(tuple)
  ).rejects.toThrow();
  expect(
    fixture.calls.filter(({ name }) => name === 'begin_employee_restore')
  ).toHaveLength(1);
});
it.each(['confirm', 'reconcile'] as const)(
  'requires independent completed state for %s',
  async (method) => {
    fixture.setMode('unpersisted');
    await expect(
      createEmployeeRestorationOperations(fixture.transport)[method](tuple)
    ).rejects.toThrow();
    expect(fixture.calls).toHaveLength(2);
  }
);
it('denies actor or target substitution before network dispatch', async () => {
  const operations = createEmployeeRestorationOperations(fixture.transport);
  await expect(
    operations.begin({ ...tuple, actorUserId: target })
  ).rejects.toThrow();
  await expect(
    operations.inspect({ actorUserId: actor, targetUserId: actor, email })
  ).rejects.toThrow();
  expect(fixture.calls).toEqual([]);
});
it('snapshots mutable input before awaited authorization', async () => {
  const mutable = { ...tuple };
  const operations = createEmployeeRestorationOperations({
    ...fixture.transport,
    authorize: async () => {
      mutable.operationId = actor;
      return true;
    },
  });
  await operations.begin(mutable);
  expect(fixture.calls[0]?.body.p_operation_id).toBe(operationId);
});
it('rechecks actor before readback and retains a single mutation', async () => {
  fixture.setRevokeAt('begin_employee_restore');
  await expect(
    createEmployeeRestorationOperations(fixture.transport).begin(tuple)
  ).rejects.toThrow();
  expect(fixture.calls.map(({ name }) => name)).toEqual([
    'begin_employee_restore',
  ]);
});
it('does not retry a dropped mutation response', async () => {
  fixture.setFailAt('begin_employee_restore');
  await expect(
    createEmployeeRestorationOperations(fixture.transport).begin(tuple)
  ).rejects.toThrow();
  expect(fixture.calls).toHaveLength(1);
});
it('rejects a completed receipt whose managed name differs', async () => {
  fixture.setObservation({ ...inspection, managedName: 'Other' });
  await expect(
    createEmployeeRestorationOperations(fixture.transport).confirm(tuple)
  ).rejects.toThrow();
});
