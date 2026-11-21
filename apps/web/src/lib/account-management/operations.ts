import { z } from 'zod';
import {
  authorizeHuman,
  type HumanAuthority,
  type VerifiedHuman,
} from './authorization';
import {
  AccountManagementError,
  consumeChallenge,
  type ChallengeStore,
  requireTargetConfirmation,
} from './policy';
import {
  type AccountMutation,
  mutationBodyHash,
  parseMutation,
  requireMutationRoute,
} from './requests';

type AuditEvent = {
  operationId: string;
  actorId: string;
  action: AccountMutation['action'];
  targetId?: string;
  phase: 'intent' | 'success' | 'failure' | 'unknown' | 'denied';
  resultStatus?: 'completed' | 'pending';
};
const outcomeSchema = z.object({
  status: z.enum(['completed', 'pending']),
  targetId: z.uuid().optional(),
});
type Outcome = z.infer<typeof outcomeSchema>;

export interface AccountOperationDependencies {
  authority: HumanAuthority;
  challenges: Pick<ChallengeStore, 'getdel'>;
  /** Must atomically reject duplicate intent operation IDs; never replay a mutation. */
  appendAudit(event: AuditEvent): Promise<void>;
  /** Adapters must apply scope, target, last-admin and self-escalation guards atomically. */
  execute(
    command: Exclude<AccountMutation, { action: 'delete' }>,
    actorId: string
  ): Promise<Outcome>;
  /** Only the durable manual-request interface; never Auth user deletion. */
  enqueueHumanDeletion?: (
    targetId: string,
    actorId: string,
    operationId: string
  ) => Promise<Outcome>;
}

/** Operates only on independently server-validated requests and verified identity. */
export async function runHumanMutation(input: {
  human: VerifiedHuman;
  command: unknown;
  route: { action: AccountMutation['action']; targetId?: string };
  dependencies: AccountOperationDependencies;
  nowSeconds: number;
}) {
  const { human, route, dependencies, nowSeconds } = input;
  const command = parseMutation(input.command);
  async function append(event: AuditEvent) {
    try {
      await dependencies.appendAudit(event);
    } catch (error) {
      if (error instanceof AccountManagementError && error.status < 500)
        throw error;
      throw new AccountManagementError('audit_unavailable', 503);
    }
  }
  requireMutationRoute(command, route);
  const event = {
    operationId: command.operationId,
    actorId: human.actorId,
    action: command.action,
    ...('targetId' in command ? { targetId: command.targetId } : {}),
  };
  try {
    await authorizeHuman(
      human,
      dependencies.authority,
      nowSeconds,
      command.action === 'admin' ||
        command.action === 'delete' ||
        command.action === 'test-delete'
    );
    if ('confirmTarget' in command) {
      requireTargetConfirmation(command.targetId, command.confirmTarget);
    }
    if ('challenge' in command) {
      await consumeChallenge(dependencies.challenges, command.challenge, {
        actorId: human.actorId,
        sessionId: human.sessionId,
        action: command.action,
        targetId: command.targetId,
        bodyHash: mutationBodyHash(command),
      });
    }
  } catch (error) {
    await append({ ...event, phase: 'denied' });
    if (error instanceof AccountManagementError) throw error;
    throw new AccountManagementError('dependency_unavailable', 503);
  }
  // An audit failure or duplicate intent stops execution before any supplier call.
  try {
    await append({ ...event, phase: 'intent' });
  } catch (error) {
    if (
      error instanceof AccountManagementError &&
      error.status < 500 &&
      error.code !== 'operation_conflict'
    )
      await append({ ...event, phase: 'denied' });
    throw error;
  }
  if (command.action === 'delete' && !dependencies.enqueueHumanDeletion) {
    await append({ ...event, phase: 'failure' });
    throw new AccountManagementError('deletion_pipeline_not_available', 503);
  }
  let result: Outcome;
  try {
    if (command.action === 'delete') {
      const enqueue = dependencies.enqueueHumanDeletion;
      if (!enqueue)
        throw new AccountManagementError(
          'deletion_pipeline_not_available',
          503
        );
      result = outcomeSchema.parse(
        await enqueue(command.targetId, human.actorId, command.operationId)
      );
    } else {
      result = outcomeSchema.parse(
        await dependencies.execute(command, human.actorId)
      );
    }
  } catch (error) {
    if (error instanceof AccountManagementError && error.status < 500) {
      await append({ ...event, phase: 'failure' });
      throw error;
    }
    // A supplier may have acted before losing its response. Preserve that uncertainty.
    await append({ ...event, phase: 'unknown' }).catch(() => undefined);
    return { operationId: command.operationId, status: 'unknown' as const };
  }
  try {
    await append({
      ...event,
      ...(result.targetId ? { targetId: result.targetId } : {}),
      phase: 'success',
      resultStatus: result.status,
    });
  } catch {
    return { operationId: command.operationId, status: 'unknown' as const };
  }
  return { operationId: command.operationId, ...result };
}
