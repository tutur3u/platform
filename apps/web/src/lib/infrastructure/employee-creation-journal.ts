import { randomUUID } from 'node:crypto';
import { z } from 'zod';
// Root composes the existing HTTP boundary; its absence on the pinned base is a gate.
import type { EmployeeCreationJournal } from './employee-creation-boundary';
import {
  type EmployeeCreationOperationStore,
  EmployeeOperationIdentitySchema,
  type EmployeeOperationSnapshot,
  EmployeeOperationStoreError,
  EmployeePhaseReceiptSchema,
} from './employee-creation-operation-store';
import {
  type EmployeeCreationPhaseAdapter,
  type EmployeeKnownFact,
  EmployeeKnownFactSchema,
  EmployeePhaseResultSchema,
  type EmployeePhaseSession,
} from './employee-creation-phase-adapter';

const PayloadSchema = EmployeeOperationIdentitySchema.omit({
  actorUserId: true,
  operationId: true,
})
  .extend({ temporaryPassword: z.string().min(12).max(72) })
  .strict();
/** Root supplies selected-target phase execution after independent qualification.
 * This port must never invoke the old per-call randomUUID creator. Unknown results
 * require separately authorized inspection of this exact target; no retry port exists. */
export type EmployeeCreationPhaseProvider = {
  available(actorUserId: string): Promise<boolean>;
  beginInvocation?: (input: {
    store: EmployeeCreationOperationStore;
    operation: EmployeeOperationSnapshot;
  }) => EmployeePhaseSession;
  createPending(input: {
    operation: EmployeeOperationSnapshot;
    temporaryPassword: string;
  }): Promise<unknown>;
  finalize(input: { operation: EmployeeOperationSnapshot }): Promise<unknown>;
  activateAndConfirm(input: {
    operation: EmployeeOperationSnapshot;
  }): Promise<unknown>;
};
export function getEmployeeCreationKnownFacts(
  value: unknown
): EmployeeKnownFact[] {
  if (typeof value !== 'object' || value === null || !('knownFacts' in value))
    return [];
  const parsed = z.array(EmployeeKnownFactSchema).safeParse(value.knownFacts);
  return parsed.success ? parsed.data : [];
}
export function createEmployeeCreationJournal(dependencies: {
  store?: EmployeeCreationOperationStore;
  provider?: EmployeeCreationPhaseProvider | EmployeeCreationPhaseAdapter;
}): EmployeeCreationJournal {
  const { store, provider } = dependencies;
  const pending = (operation: EmployeeOperationSnapshot, unknown = true) => ({
    targetUserId: operation.targetUserId,
    outcome: {
      status: 'pending',
      operationId: operation.operationId,
      code: unknown
        ? 'account_creation_outcome_unknown'
        : 'employee_provisioning_pending',
      nextAction: 'inspect',
    },
  });
  function inspect(operation: EmployeeOperationSnapshot) {
    const receipt = operation.lastReceipt;
    if (
      operation.phase === 'active' &&
      !operation.revoked &&
      receipt?.authConfirmed &&
      receipt.providerActive &&
      receipt.sqlConfirmed &&
      receipt.profilesConfirmed &&
      receipt.mailboxConfirmed &&
      receipt.grantsConfirmed &&
      !receipt.authPending
    ) {
      return {
        targetUserId: operation.targetUserId,
        outcome: {
          status: 'created',
          operationId: operation.operationId,
          account: {
            id: operation.targetUserId,
            email: operation.email,
            displayName: operation.displayName,
          },
        },
      };
    }
    return pending(operation, operation.phase !== 'provisioned');
  }
  return {
    async available(actorUserId) {
      if (!store || !provider?.beginInvocation) return false;
      try {
        return (
          (await store.available(actorUserId)) &&
          (await provider.available(actorUserId))
        );
      } catch {
        return false;
      }
    },
    async claimAndRun(input) {
      if (!store || !provider?.beginInvocation)
        throw new EmployeeOperationStoreError('unavailable');
      const payload = PayloadSchema.parse(input.payload);
      const identity = EmployeeOperationIdentitySchema.parse({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        email: payload.email,
        displayName: payload.displayName,
      });
      if (
        !(await store.available(identity.actorUserId)) ||
        !(await provider.available(identity.actorUserId))
      )
        throw new EmployeeOperationStoreError('unavailable');
      const claim = await store.claim(identity);
      const boundStore = store;
      const session = provider.beginInvocation({
        store,
        operation: claim.operation,
      });
      let operation = claim.operation;
      let capability: object | null = null;
      let knownFacts: EmployeeKnownFact[] = [];
      function halted() {
        const result = pending(operation, false);
        Object.defineProperty(result, 'knownFacts', {
          value: structuredClone(knownFacts),
          enumerable: false,
        });
        return result;
      }
      if (claim.kind === 'payload_conflict')
        return {
          targetUserId: operation.targetUserId,
          outcome: {
            status: 'conflict',
            operationId: identity.operationId,
            code: 'employee_operation_payload_conflict',
            nextAction: 'inspect',
          },
        };
      if (claim.kind !== 'claimed') return inspect(operation);
      async function move(
        nextPhase: Parameters<typeof boundStore.advance>[1],
        receipt: Parameters<typeof boundStore.advance>[2] = null
      ) {
        const result = await session.advance(nextPhase, receipt, randomUUID());
        operation = result.operation;
        capability = result.capability;
        return result.kind === 'advanced';
      }
      async function effect(kind: 'auth' | 'finalize' | 'activation') {
        if (!capability) return { kind: 'denied' as const };
        operation = await boundStore.assertAuthority(operation);
        const input = { operation, capability };
        capability = null;
        if (!session.handoff(input)) return { kind: 'denied' as const };
        const raw =
          kind === 'auth'
            ? await session.createPending({
                ...input,
                temporaryPassword: payload.temporaryPassword,
              })
            : kind === 'finalize'
              ? await session.finalize(input)
              : await session.activateAndConfirm(input);
        const result = EmployeePhaseResultSchema.safeParse(raw);
        if (!result.success) return { kind: 'unknown' as const };
        const value = result.data;
        if (value.kind === 'halted' || value.kind === 'qualified') {
          if (
            value.facts.some((fact) =>
              fact.kind === 'auth'
                ? fact.resourceId !== operation.targetUserId ||
                  fact.email !== operation.email
                : fact.receipt.id !== operation.targetUserId ||
                  fact.receipt.email !== operation.email ||
                  fact.receipt.displayName !== operation.displayName
            )
          )
            return { kind: 'unknown' as const };
          knownFacts = value.facts;
        }
        if (value.kind !== 'qualified') return value;
        const receipt = EmployeePhaseReceiptSchema.parse(value.receipt);
        if (
          receipt.targetUserId !== operation.targetUserId ||
          receipt.providerReceiptId !== operation.targetUserId ||
          receipt.email !== operation.email ||
          !receipt.authConfirmed ||
          (kind !== 'activation' &&
            (!receipt.authPending || receipt.providerActive)) ||
          (kind !== 'auth' &&
            (!receipt.sqlConfirmed ||
              !receipt.profilesConfirmed ||
              !receipt.mailboxConfirmed ||
              !receipt.grantsConfirmed)) ||
          (kind === 'activation' &&
            (receipt.authPending || !receipt.providerActive))
        )
          return { kind: 'unknown' as const };
        return value;
      }
      async function execute(
        kind: 'auth' | 'finalize' | 'activation',
        next: Parameters<typeof session.advance>[0]
      ) {
        const result = await effect(kind);
        if (result.kind === 'qualified')
          return (await move(next, result.receipt)) ? null : halted();
        if (result.kind === 'halted' || knownFacts.length) return halted();
        if (result.kind === 'conflict')
          return {
            targetUserId: operation.targetUserId,
            outcome: {
              status: 'conflict',
              operationId: operation.operationId,
              code: 'employee_account_conflict',
              nextAction: 'inspect',
            },
          };
        if (result.kind === 'unknown') {
          try {
            await move('unknown');
          } catch {}
        }
        return pending(operation, result.kind === 'unknown');
      }
      try {
        if (!(await move('auth_attempted'))) return inspect(operation);
        const auth = await execute('auth', 'auth_confirmed');
        if (auth) return auth;
        if (!(await move('finalize_attempted'))) return inspect(operation);
        const finalized = await execute('finalize', 'provisioned');
        if (finalized) return finalized;
        if (!(await move('activation_attempted'))) return inspect(operation);
        const active = await execute('activation', 'active');
        if (active) return active;
        return inspect(operation);
      } catch {
        if (knownFacts.length) return halted();
        // Unknown alone may request an authorized mark; never force a known-fact
        // write through lost actor/lease/scope authority.
        try {
          await move('unknown');
        } catch {
          /* Durable attempted phase already fences replay. */
        }
        return pending(operation);
      }
    },
  };
}
