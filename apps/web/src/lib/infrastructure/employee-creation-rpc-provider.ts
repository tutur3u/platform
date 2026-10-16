import 'server-only';
import { z } from 'zod';
import type {
  EmployeeOperationSnapshot,
  EmployeePhaseReceipt,
} from './employee-creation-operation-store';
import type {
  EmployeeCreationPhaseAdapter,
  EmployeeKnownFact,
  EmployeePhaseResult,
} from './employee-creation-phase-adapter';
import {
  EmployeeRpcError,
  type EmployeeRuntimeRpc,
} from './employee-creation-rpc';
import type { EmployeeAuthAdmin } from './employee-creation-supplier';

const ProviderUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  email_confirmed_at: z.string(),
  banned_until: z.string().nullable().optional(),
  app_metadata: z.object({ employee_onboarding: z.literal(true) }),
});
function providerUser(value: unknown, operation: EmployeeOperationSnapshot) {
  const parsed = ProviderUserSchema.safeParse(value);
  if (!parsed.success) return null;
  const user = parsed.data;
  const ban = user.banned_until ? Date.parse(user.banned_until) : 0;
  if (
    user.id !== operation.targetUserId ||
    user.email !== operation.email ||
    !Number.isFinite(Date.parse(user.email_confirmed_at)) ||
    !Number.isFinite(ban)
  )
    return null;
  return {
    user,
    state: ban > Date.now() ? ('banned' as const) : ('active' as const),
  };
}
export function createEmployeeRpcPhaseProvider(deps: {
  transport: EmployeeRuntimeRpc;
  auth: EmployeeAuthAdmin;
  authorize(actorUserId: string): Promise<boolean>;
}): EmployeeCreationPhaseAdapter {
  async function ready(actorUserId: string) {
    if (!(await deps.authorize(actorUserId))) throw new EmployeeRpcError();
    return deps.transport.ready(actorUserId);
  }
  return {
    async available(actorUserId) {
      try {
        await ready(actorUserId);
        return true;
      } catch {
        return false;
      }
    },
    beginInvocation({ store, operation: original }) {
      let current = original;
      let issued: object | null = null;
      let accepted = false;
      let knownFacts: EmployeeKnownFact[] = [];
      const uncertain = (): EmployeePhaseResult =>
        knownFacts.length
          ? { kind: 'halted', facts: knownFacts, continuationAllowed: false }
          : { kind: 'unknown' };
      function same(operation: EmployeeOperationSnapshot) {
        return JSON.stringify(operation) === JSON.stringify(current);
      }
      function take(
        input: { operation: EmployeeOperationSnapshot },
        phase: string
      ) {
        if (!accepted || !same(input.operation) || current.phase !== phase)
          return false;
        accepted = false;
        return true;
      }
      async function authority() {
        await ready(current.actorUserId);
        await store.assertAuthority(current);
      }
      function receipt(active: boolean, sql: boolean): EmployeePhaseReceipt {
        return {
          targetUserId: current.targetUserId,
          email: current.email,
          providerReceiptId: current.targetUserId,
          authConfirmed: true,
          authPending: !active,
          providerActive: active,
          sqlConfirmed: sql,
          profilesConfirmed: sql,
          mailboxConfirmed: sql,
          grantsConfirmed: sql,
        };
      }
      async function inspected() {
        const response = await deps.auth.getUserById(current.targetUserId);
        if (response.error) return null;
        return providerUser(response.data.user, current);
      }
      function rememberAuth(
        verified: NonNullable<ReturnType<typeof providerUser>>
      ) {
        knownFacts = [
          {
            kind: 'auth',
            resourceId: verified.user.id,
            email: verified.user.email,
            state: verified.state,
            confirmedAt: verified.user.email_confirmed_at,
            onboarding: true,
          },
          ...knownFacts.filter((fact) => fact.kind === 'sql'),
        ];
      }
      async function outcome(
        verified: NonNullable<ReturnType<typeof providerUser>>,
        sql?: {
          phase: 'finalize' | 'confirm';
          receipt: Awaited<ReturnType<EmployeeRuntimeRpc['provision']>>;
          hash: string;
        }
      ): Promise<EmployeePhaseResult> {
        const facts: EmployeeKnownFact[] = [
          {
            kind: 'auth' as const,
            resourceId: verified.user.id,
            email: verified.user.email,
            state: verified.state,
            confirmedAt: verified.user.email_confirmed_at,
            onboarding: true as const,
          },
          ...(sql
            ? [
                {
                  kind: 'sql' as const,
                  phase: sql.phase,
                  receipt: sql.receipt,
                  definitionSha256: sql.hash,
                },
              ]
            : []),
        ];
        knownFacts = facts;
        try {
          await authority();
        } catch {
          return { kind: 'halted', facts, continuationAllowed: false };
        }
        return {
          kind: 'qualified',
          facts,
          receipt: receipt(verified.state === 'active', Boolean(sql)),
        };
      }
      return {
        async advance(phase, proof, eventId) {
          accepted = false;
          issued = null;
          const result = await store.advance(current, phase, proof, eventId);
          current = result.operation;
          if (
            result.kind === 'advanced' &&
            [
              'auth_attempted',
              'finalize_attempted',
              'activation_attempted',
            ].includes(phase)
          )
            issued = Object.freeze({});
          return { ...result, capability: issued };
        },
        handoff(input) {
          if (!issued || input.capability !== issued || !same(input.operation))
            return false;
          issued = null;
          accepted = true;
          return true;
        },
        async createPending(input) {
          if (!take(input, 'auth_attempted')) return { kind: 'denied' };
          try {
            await authority();
            const response = await deps.auth.createUser({
              id: current.targetUserId,
              email: current.email,
              password: z
                .string()
                .min(12)
                .max(72)
                .parse(input.temporaryPassword),
              email_confirm: true,
              ban_duration: '876000h',
              app_metadata: { employee_onboarding: true },
              user_metadata: {
                display_name: current.displayName,
                full_name: current.displayName,
              },
            });
            if (response.error)
              return {
                kind: ['email_exists', 'user_already_exists'].includes(
                  response.error.code ?? ''
                )
                  ? 'conflict'
                  : 'unknown',
              };
            const verified = providerUser(response.data.user, current);
            if (verified?.state !== 'banned') return { kind: 'unknown' };
            return outcome(verified);
          } catch {
            return uncertain();
          }
        },
        async finalize(input) {
          if (!take(input, 'finalize_attempted')) return { kind: 'denied' };
          try {
            await authority();
            const verified = await inspected();
            if (verified?.state !== 'banned') return { kind: 'unknown' };
            rememberAuth(verified);
            await authority();
            const proof = await ready(current.actorUserId);
            const account = await deps.transport.provision(current, 'finalize');
            if (
              account.id !== current.targetUserId ||
              account.email !== current.email ||
              account.displayName !== current.displayName ||
              account.status !== 'pending'
            )
              return { kind: 'unknown' };
            return outcome(verified, {
              phase: 'finalize',
              receipt: account,
              hash: proof.finalizeSha256,
            });
          } catch {
            return uncertain();
          }
        },
        async activateAndConfirm(input) {
          if (!take(input, 'activation_attempted')) return { kind: 'denied' };
          try {
            await authority();
            let verified = await inspected();
            if (!verified) return { kind: 'unknown' };
            rememberAuth(verified);
            if (verified.state === 'banned') {
              await authority();
              const response = await deps.auth.updateUserById(
                current.targetUserId,
                { ban_duration: 'none' }
              );
              if (response.error) return { kind: 'unknown' };
              verified = providerUser(response.data.user, current);
            }
            if (verified?.state !== 'active') return { kind: 'unknown' };
            rememberAuth(verified);
            await authority();
            const active = await inspected();
            if (active?.state !== 'active') return { kind: 'unknown' };
            await authority();
            const proof = await ready(current.actorUserId);
            const account = await deps.transport.provision(current, 'confirm');
            if (
              account.id !== current.targetUserId ||
              account.email !== current.email ||
              account.displayName !== current.displayName ||
              account.status !== 'created'
            )
              return { kind: 'unknown' };
            return outcome(active, {
              phase: 'confirm',
              receipt: account,
              hash: proof.confirmSha256,
            });
          } catch {
            return uncertain();
          }
        },
      };
    },
  };
}
