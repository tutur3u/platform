import { AuthApiError } from '@tuturuuu/supabase/auth-errors';
import { expect, vi } from 'vitest';
import type {
  EmployeeRestorationOperations as Operations,
  EmployeeRestorationProvider as Provider,
  EmployeeRestoreTuple,
  Inspection,
} from './employee-restoration-boundary';
import type { EmployeeRestorationInput } from './employee-restoration-orchestration';

export const id = '10000000-0000-4000-8000-000000000001';
export const actor = '10000000-0000-4000-8000-000000000002';
export const op = '10000000-0000-4000-8000-000000000003';
export const otherOp = '10000000-0000-4000-8000-000000000004';
export const email = 'restoration-fixture@tuturuuu.com';
export type ReadReply = Awaited<ReturnType<Provider['getUserById']>>;
export type UpdateReply = Awaited<ReturnType<Provider['updateUserById']>>;
export type User = NonNullable<ReadReply['data']['user']>;
export const baseUser = Object.freeze({
  id, email, aud: 'authenticated', created_at: '2026-01-01',
  email_confirmed_at: '2026-01-01', banned_until: '2126-01-01',
  app_metadata: { employee_onboarding: true }, user_metadata: {},
} satisfies User);
export const baseInspection = Object.freeze({
  id, email, registryState: 'active', managedName: 'Fixture',
  managementRoleLabel: null, revision: 0, mailboxReady: true,
  readinessCode: 'ready', reservation: 'exact_intent', managed: true,
  operation: null, recovery: { email: 'private-recovery@example.test', verified: false },
} satisfies Inspection);
export const readReply = (user: User): ReadReply => ({ data: { user }, error: null });
export const updateReply = (user: User): UpdateReply => ({ data: { user }, error: null });
export const providerError = (status = 503, code = 'unexpected_failure'): ReadReply => ({
  data: { user: null }, error: new AuthApiError('synthetic private diagnostic', status, code),
});
export const ack = (data: unknown) => ({ data, error: null });
export const denial = (code: string) => ({
  data: null, error: { code, message: 'private diagnostic', details: 'private recovery' },
});
export const operationReceipt = (args: EmployeeRestoreTuple, phase: 'reserved' | 'attempted') =>
  ack({ operationId: args.operationId, revision: args.expectedRevision, phase });
export const restoredReceipt = (args: EmployeeRestoreTuple) => ({
  id: args.targetUserId, email: args.email, displayName: 'Fixture',
  revision: args.expectedRevision + 1, operationId: args.operationId, status: 'restored',
});
export const definiteCodes = [
  ['42501', 403], ['P0002', 404], ['23505', 409], ['23514', 409], ['40001', 409],
] as const;
export const malformedAcks: unknown[] = [
  null, 1, 'ack', [], {}, { data: true }, { error: null },
  { data: true, error: undefined }, { data: true, error: 'bad' },
  { data: true, error: {} }, { data: true, error: { code: 1 } },
  { data: true, error: { code: '' } }, { data: true, error: { code: 'x'.repeat(129) } },
  Object.create({ data: true, error: null }),
  Object.assign(Object.create({ data: true }), { error: null }),
  Object.assign(Object.create({ error: null }), { data: true }),
  { data: true, error: Object.create({ code: '42501' }) },
  Object.defineProperty({ data: true, error: null }, 'error', { enumerable: false, get() { throw Error('private getter diagnostic'); } }),
];

export function makeFixture() {
  const user: User = { ...baseUser, app_metadata: { ...baseUser.app_metadata } };
  const active: User = { ...user, banned_until: undefined };
  const administrator: User = { ...active, id: actor };
  const inspection: Inspection = { ...baseInspection, recovery: { ...baseInspection.recovery } };
  const events: string[] = [];
  let targetReads = 0;
  const getUserById = vi.fn<Provider['getUserById']>(async function (
    this: Provider, ...[target]: Parameters<Provider['getUserById']>
  ): Promise<ReadReply> {
    expect(this).toBe(provider);
    events.push(target === actor ? 'actor' : 'read');
    if (target === actor) return readReply(administrator);
    targetReads += 1;
    return readReply(targetReads === 1 ? user : active);
  });
  const updateUserById = vi.fn<Provider['updateUserById']>(async function (
    this: Provider, ..._args: Parameters<Provider['updateUserById']>
  ): Promise<UpdateReply> {
    expect(this).toBe(provider);
    events.push('update');
    return updateReply(active);
  });
  const provider = { getUserById, updateUserById } satisfies Provider;
  const inspect = vi.fn<Operations['inspect']>(async () => {
    events.push('inspect'); return ack(inspection);
  });
  const begin = vi.fn<Operations['begin']>(async (args) => {
    events.push('begin'); return operationReceipt(args, 'reserved');
  });
  const markAttempt = vi.fn<Operations['markAttempt']>(async (args) => {
    events.push('markAttempt'); return operationReceipt(args, 'attempted');
  });
  const confirm = vi.fn<Operations['confirm']>(async (args) => {
    events.push('confirm'); return ack(restoredReceipt(args));
  });
  const reconcile = vi.fn<Operations['reconcile']>(async (args) => {
    events.push('reconcile'); return ack(restoredReceipt(args));
  });
  const operations = { inspect, begin, markAttempt, confirm, reconcile } satisfies Operations;
  const input = { provider, operations, actorUserId: actor, targetUserId: id,
    confirmationEmail: email, expectedRevision: 0 } satisfies EmployeeRestorationInput;
  return { input, user, active, administrator, inspection, events, provider, operations,
    getUserById, updateUserById };
}
