import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { z } from 'zod';
import type {
  EmployeeOperationAuthority,
  EmployeeOperationIdentity,
  EmployeeOperationSnapshot,
  EmployeePhaseReceiptSchema,
} from './employee-creation-operation-store';
import {
  type EmployeeCreationPhaseAdapter,
  type EmployeeKnownFact,
  EmployeePhaseResultSchema,
  type EmployeePhaseSession,
} from './employee-creation-phase-adapter';

const ActorProofSchema = z
  .object({
    actorUserId: z.uuid(),
    workspaceId: z.literal('00000000-0000-0000-0000-000000000000'),
    membership: z.literal('MEMBER'),
    permission: z.enum(['admin', 'manage_internal_accounts']),
    email: z.email().endsWith('@tuturuuu.com'),
    emailConfirmed: z.literal(true),
    unbanned: z.literal(true),
    observedAt: z.number().int(),
    expiresAt: z.number().int(),
  })
  .strict() satisfies z.ZodType<EmployeeOperationAuthority>;

const UserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    email_confirmed_at: z.string(),
    banned_until: z.string().nullable(),
    app_metadata: z.object({ employee_onboarding: z.literal(true) }),
  })
  .strict();
const SqlSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    status: z.enum(['pending', 'created']),
  })
  .strict();
export type User = z.infer<typeof UserSchema>;
export type Sql = z.infer<typeof SqlSchema>;
export type Identity = EmployeeOperationIdentity & { targetUserId: string };
export type Ports = {
  auth: {
    create(input: Identity & { temporaryPassword: string }): Promise<unknown>;
    activate(input: Identity): Promise<unknown>;
  };
  transaction(
    input: Identity,
    phase: 'preflight' | 'finalize' | 'confirm'
  ): Promise<unknown>;
  records(input: Identity): {
    profiles: boolean;
    mailbox: boolean;
    grants: boolean;
  };
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Strict journal-session fixture, not a production adapter qualification. */
export function createEmployeeStoreTestPhaseFixture(deps: {
  current(): EmployeeOperationSnapshot;
  now(): number;
  actorProof(actor: string): unknown;
  ports: Ports;
  onEffect(
    name: 'auth' | 'finalize' | 'activate',
    operation: EmployeeOperationSnapshot
  ): void;
}): EmployeeCreationPhaseAdapter {
  const migration = readFileSync(
    new NodeURL(
      '../../../../database/supabase/migrations/20261011002108_employee_creation_finalization.sql',
      import.meta.url
    ),
    'utf8'
  );
  function definitionHash(name: string) {
    const start = migration.indexOf(`create function private.${name}(`);
    const end = migration.indexOf('$$;', start);
    if (start < 0 || end < 0) throw new Error('fixture source anchor missing');
    return createHash('sha256')
      .update(migration.slice(start, end + 3))
      .digest('hex');
  }
  const hashes = {
    finalize: definitionHash('finalize_employee_creation'),
    confirm: definitionHash('confirm_employee_activation'),
  };
  function actorLive(actor: string) {
    const parsed = ActorProofSchema.safeParse(deps.actorProof(actor));
    const now = deps.now();
    return (
      parsed.success &&
      parsed.data.actorUserId === actor &&
      Number.isFinite(now) &&
      parsed.data.observedAt <= now &&
      now < parsed.data.expiresAt
    );
  }
  return {
    async available(actor) {
      return actorLive(actor);
    },
    beginInvocation({ store, operation: initial }): EmployeePhaseSession {
      const original = structuredClone(initial);
      const identity: Identity = {
        actorUserId: original.actorUserId,
        operationId: original.operationId,
        targetUserId: original.targetUserId,
        email: original.email,
        displayName: original.displayName,
      };
      let current = structuredClone(original);
      const registry = new WeakMap<
        object,
        {
          operation: EmployeeOperationSnapshot;
          eventId: string;
          handed: boolean;
          used: boolean;
          consumed: boolean;
        }
      >();
      const events = new Set<string>();
      const proofs = new Map<
        string,
        z.infer<typeof EmployeePhaseReceiptSchema>
      >();
      let pending: {
        receipt: z.infer<typeof EmployeePhaseReceiptSchema>;
        ack: EmployeeOperationSnapshot | null;
      } | null = null;
      let observedUser: User | null = null;
      let sql: Sql | null = null;
      const facts: EmployeeKnownFact[] = [];
      function captured(value: {
        operation: EmployeeOperationSnapshot;
        capability: object;
      }) {
        const entry = registry.get(value.capability);
        const row = deps.current();
        const time = deps.now();
        return entry &&
          same(entry.operation, value.operation) &&
          same(row, entry.operation) &&
          same(current, entry.operation) &&
          !row.revoked &&
          row.leaseId === original.leaseId &&
          row.leaseExpiresAt === original.leaseExpiresAt &&
          Number.isFinite(time) &&
          time < row.leaseExpiresAt &&
          actorLive(row.actorUserId)
          ? entry
          : null;
      }
      function result() {
        if (!observedUser)
          return EmployeePhaseResultSchema.parse({ kind: 'unknown' });
        const state = observedUser.banned_until === null ? 'active' : 'banned';
        const records = deps.ports.records(identity);
        return EmployeePhaseResultSchema.parse({
          kind: 'qualified',
          facts,
          receipt: {
            targetUserId: observedUser.id,
            providerReceiptId: observedUser.id,
            email: observedUser.email,
            authConfirmed: Number.isFinite(
              Date.parse(observedUser.email_confirmed_at)
            ),
            authPending: state === 'banned',
            providerActive: state === 'active',
            sqlConfirmed: sql !== null,
            profilesConfirmed: records.profiles,
            mailboxConfirmed: records.mailbox,
            grantsConfirmed: records.grants,
          },
        });
      }
      function observeUser(raw: unknown, active: boolean) {
        const user = UserSchema.parse(raw);
        const ban =
          user.banned_until === null ? null : Date.parse(user.banned_until);
        if (
          user.id !== identity.targetUserId ||
          user.email !== identity.email ||
          !Number.isFinite(Date.parse(user.email_confirmed_at)) ||
          (active
            ? ban !== null
            : ban === null || !Number.isFinite(ban) || ban <= deps.now())
        )
          throw new Error('fixture Auth reply mismatch');
        observedUser = user;
        facts.push({
          kind: 'auth',
          resourceId: user.id,
          email: user.email,
          state: active ? 'active' : 'banned',
          confirmedAt: user.email_confirmed_at,
          onboarding: user.app_metadata.employee_onboarding,
        });
      }
      function observeSql(raw: unknown, phase: 'finalize' | 'confirm') {
        const receipt = SqlSchema.parse(raw);
        if (
          receipt.id !== identity.targetUserId ||
          receipt.email !== identity.email ||
          receipt.displayName !== identity.displayName ||
          receipt.status !== (phase === 'finalize' ? 'pending' : 'created')
        )
          throw new Error('fixture SQL receipt mismatch');
        sql = receipt;
        facts.push({
          kind: 'sql',
          phase,
          receipt,
          definitionSha256: hashes[phase],
        });
      }
      async function run(
        value: { operation: EmployeeOperationSnapshot; capability: object },
        phase: string,
        password?: string
      ) {
        const entry = captured(value);
        if (!entry?.handed || entry.used || value.operation.phase !== phase)
          return EmployeePhaseResultSchema.parse({ kind: 'denied' });
        entry.used = true;
        try {
          if (phase === 'auth_attempted') {
            const preflight = await deps.ports.transaction(
              identity,
              'preflight'
            );
            const intent = {
              actorUserId: identity.actorUserId,
              operationId: identity.operationId,
              email: identity.email,
              displayName: identity.displayName,
            };
            if (
              !same(preflight, intent) ||
              !captured(value) ||
              entry.consumed ||
              !password
            )
              return EmployeePhaseResultSchema.parse({ kind: 'denied' });
            entry.consumed = true;
            deps.onEffect('auth', value.operation);
            observeUser(
              await deps.ports.auth.create({
                ...identity,
                temporaryPassword: password,
              }),
              false
            );
          } else if (phase === 'finalize_attempted') {
            if (!observedUser || observedUser.banned_until === null)
              throw new Error('fixture auth proof missing');
            deps.onEffect('finalize', value.operation);
            observeSql(
              await deps.ports.transaction(identity, 'finalize'),
              'finalize'
            );
          } else {
            if (!pending?.ack || !same(pending.receipt, current.lastReceipt))
              throw new Error('fixture pending ACK missing');
            deps.onEffect('activate', value.operation);
            observeUser(await deps.ports.auth.activate(identity), true);
            if (!captured(value))
              return EmployeePhaseResultSchema.parse({
                kind: 'halted',
                facts,
                continuationAllowed: false,
              });
            observeSql(
              await deps.ports.transaction(identity, 'confirm'),
              'confirm'
            );
          }
          if (!captured(value))
            return EmployeePhaseResultSchema.parse({
              kind: 'halted',
              facts,
              continuationAllowed: false,
            });
          const projected = result();
          if (projected.kind === 'qualified') {
            proofs.set(phase, projected.receipt);
            if (phase === 'finalize_attempted')
              pending = { receipt: projected.receipt, ack: null };
          }
          return projected;
        } catch {
          return EmployeePhaseResultSchema.parse(
            facts.length
              ? { kind: 'halted', facts, continuationAllowed: false }
              : { kind: 'unknown' }
          );
        }
      }
      return {
        async advance(phase, receipt, eventId) {
          if (original.phase !== 'reserved')
            throw new Error('fixture restart inspection only');
          z.uuid().parse(eventId);
          if (
            (phase === 'auth_confirmed' &&
              !same(receipt, proofs.get('auth_attempted'))) ||
            (phase === 'provisioned' && !same(receipt, pending?.receipt)) ||
            (phase === 'active' &&
              !same(receipt, proofs.get('activation_attempted'))) ||
            (phase === 'activation_attempted' &&
              (!pending?.ack || !same(current, pending.ack)))
          )
            throw new Error('fixture original proof missing');
          const advanced = await store.advance(
            current,
            phase,
            receipt,
            eventId
          );
          current = advanced.operation;
          let capability: object | null = null;
          if (advanced.kind === 'advanced' && !events.has(eventId)) {
            events.add(eventId);
            if (phase === 'provisioned' && pending)
              pending.ack = structuredClone(current);
            if (
              [
                'auth_attempted',
                'finalize_attempted',
                'activation_attempted',
              ].includes(phase)
            ) {
              capability = Object.freeze({});
              registry.set(capability, {
                operation: structuredClone(current),
                eventId,
                handed: false,
                used: false,
                consumed: false,
              });
            }
          }
          return { ...advanced, capability };
        },
        handoff(value) {
          const entry = captured(value);
          if (!entry || entry.handed || entry.used) return false;
          entry.handed = true;
          return true;
        },
        createPending: (value) =>
          run(value, 'auth_attempted', value.temporaryPassword),
        finalize: (value) => run(value, 'finalize_attempted'),
        activateAndConfirm: (value) => run(value, 'activation_attempted'),
      };
    },
  };
}
