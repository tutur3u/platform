import 'server-only';
import { z } from 'zod';
import {
  type EmployeeCreationOperationRpc,
  type EmployeeOperationSnapshot,
  EmployeeOperationSnapshotSchema,
} from './employee-creation-operation-store';

export const EmployeeRuntimeReadySchema = z
  .object({
    ready: z.literal(true),
    contract: z.literal('employee-http-rpc-v1'),
    finalizeSha256: z.string().regex(/^[a-f0-9]{64}$/),
    confirmSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const EmployeeRuntimeAccountSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(100),
    status: z.enum(['pending', 'created']),
  })
  .strict();
const ObservationSchema = z
  .object({
    operation: EmployeeOperationSnapshotSchema.nullable(),
    account: EmployeeRuntimeAccountSchema.nullable(),
  })
  .strict();
const MutationSchema = z
  .object({
    kind: z.enum(['claimed', 'inspect', 'payload_conflict', 'advanced']),
    operation: EmployeeOperationSnapshotSchema,
  })
  .strict();
export class EmployeeRpcError extends Error {
  constructor(readonly code: string = 'employee_rpc_unavailable') {
    super(code);
  }
}

/** Fixed RPC names only. Neither request headers nor caller SQL cross this port. */
export function createEmployeeRuntimeRpc(input: {
  url: string;
  key: string;
  fetch?: typeof fetch;
}) {
  const origin = new URL(input.url);
  if (
    origin.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(origin.hostname)
  )
    throw new EmployeeRpcError();
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !input.key
  )
    throw new EmployeeRpcError();
  const fetcher = input.fetch ?? globalThis.fetch;
  async function call(name: string, body: object): Promise<unknown> {
    const response = await fetcher(new URL(`/rest/v1/rpc/${name}`, origin), {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: input.key,
        Authorization: `Bearer ${input.key}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
        'Accept-Profile': 'private',
        Prefer: 'tx=commit',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 262144)
      throw new EmployeeRpcError();
    if (
      !response.ok ||
      response.headers.get('preference-applied')?.includes('tx=rollback')
    ) {
      let code = 'employee_rpc_unavailable';
      try {
        const error = z
          .object({ code: z.string().regex(/^[A-Z0-9_]{1,32}$/) })
          .safeParse(JSON.parse(text));
        if (error.success) code = error.data.code;
      } catch {}
      throw new EmployeeRpcError(code);
    }
    return JSON.parse(text);
  }
  async function inspect(actorUserId: string, operationId: string) {
    return ObservationSchema.parse(
      await call('employee_creation_runtime_inspect', {
        p_actor_id: actorUserId,
        p_operation_id: operationId,
      })
    );
  }
  async function persisted(operation: EmployeeOperationSnapshot) {
    const observed = await inspect(
      operation.actorUserId,
      operation.operationId
    );
    if (JSON.stringify(observed.operation) !== JSON.stringify(operation))
      throw new EmployeeRpcError('employee_commit_unconfirmed');
    return observed;
  }
  const rpc: EmployeeCreationOperationRpc = {
    async ready(actorUserId) {
      const proof = EmployeeRuntimeReadySchema.parse(
        await call('employee_creation_runtime_ready', {
          p_actor_id: actorUserId,
        })
      );
      return { ready: proof.ready };
    },
    async claim(identity) {
      const result = MutationSchema.parse(
        await call('employee_creation_operation_claim', {
          p_actor_id: identity.actorUserId,
          p_operation_id: identity.operationId,
          p_email: identity.email,
          p_name: identity.displayName,
        })
      );
      await persisted(result.operation);
      return result;
    },
    async advance(value) {
      const result = MutationSchema.parse(
        await call('employee_creation_operation_advance', {
          p_actor_id: value.actorUserId,
          p_operation_id: value.operationId,
          p_lease_id: value.leaseId,
          p_expected_version: value.expectedVersion,
          p_event_id: value.eventId,
          p_next_phase: value.nextPhase,
          p_receipt: value.receipt,
        })
      );
      await persisted(result.operation);
      return result;
    },
    async revoke(value) {
      const operation = EmployeeOperationSnapshotSchema.parse(
        await call('employee_creation_operation_revoke', {
          p_actor_id: value.actorUserId,
          p_operation_id: value.operationId,
        })
      );
      await persisted(operation);
      return operation;
    },
  };
  return {
    rpc,
    inspect,
    async ready(actorUserId: string) {
      return EmployeeRuntimeReadySchema.parse(
        await call('employee_creation_runtime_ready', {
          p_actor_id: actorUserId,
        })
      );
    },
    async provision(
      operation: EmployeeOperationSnapshot,
      phase: 'finalize' | 'confirm'
    ) {
      const body = {
        p_actor_id: operation.actorUserId,
        p_user_id: operation.targetUserId,
        p_email: operation.email,
      };
      const account = EmployeeRuntimeAccountSchema.parse(
        await call(
          phase === 'finalize'
            ? 'finalize_employee_creation'
            : 'confirm_employee_activation',
          phase === 'finalize'
            ? { ...body, p_name: operation.displayName }
            : body
        )
      );
      const observed = await inspect(
        operation.actorUserId,
        operation.operationId
      );
      if (
        !observed.account ||
        JSON.stringify(observed.account) !== JSON.stringify(account)
      )
        throw new EmployeeRpcError('employee_commit_unconfirmed');
      return account;
    },
  };
}
export type EmployeeRuntimeRpc = ReturnType<typeof createEmployeeRuntimeRpc>;
