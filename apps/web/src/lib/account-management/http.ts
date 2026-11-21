import { z } from 'zod';
import { authorizeHuman } from './authorization';
import { createChallengeStore } from './challenge-store';
import {
  accountData,
  humanAuthority,
  operationArgs,
  operationAudit,
  readAccounts,
} from './database';
import { executeHumanMutation, executeTestMutation } from './execute';
import { runHumanMutation } from './operations';
import {
  AccountManagementError,
  issueChallenge,
  requireTargetConfirmation,
} from './policy';
import {
  type AccountMutation,
  mutationBodyHash,
  parseMutation,
  requireMutationRoute,
} from './requests';
import {
  accountAdmin,
  exchangeRunnerCredential,
  resolveAccountActor,
} from './session';

async function jsonBody(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      request.headers.get('content-type') ?? ''
    )
  )
    throw new AccountManagementError('invalid_request', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountManagementError('invalid_request', 400);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096)
        throw new AccountManagementError('request_too_large', 413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw new AccountManagementError('invalid_request', 400);
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function accountResponse(run: () => Promise<unknown>) {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  try {
    const result = await run();
    return Response.json(result, { headers });
  } catch (error) {
    const failure =
      error instanceof AccountManagementError
        ? error
        : new AccountManagementError('unavailable', 503);
    return Response.json(
      { error: failure.code },
      { headers, status: failure.status }
    );
  }
}

export function accountsRead(request: Request, targetId?: string) {
  return accountResponse(async () => {
    const actor = await resolveAccountActor(request);
    return readAccounts(await accountAdmin(), actor.id, request, targetId);
  });
}

export function accountOperationStatus(request: Request, operationId: string) {
  return accountResponse(async () => {
    const actor = await resolveAccountActor(request, true);
    if (!z.uuid().safeParse(operationId).success)
      throw new AccountManagementError('not_found', 404);
    const admin = await accountAdmin();
    return accountData(
      await admin
        .schema('private')
        .rpc('accounts_operation_status', operationArgs(actor, operationId))
    );
  });
}

export function accountsMachineExchange(request: Request) {
  return accountResponse(async () =>
    exchangeRunnerCredential(request, await accountAdmin())
  );
}

const challengeBody = z
  .object({
    action: z.literal('admin'),
    operationId: z.uuid(),
    confirmTarget: z.uuid(),
    enabled: z.boolean(),
  })
  .strict();

export function accountsChallenge(request: Request, targetId: string) {
  return accountResponse(async () => {
    const actor = await resolveAccountActor(request);
    if (actor.kind !== 'human')
      throw new AccountManagementError('unauthorized', 401);
    const body = challengeBody.safeParse(await jsonBody(request));
    if (!body.success) throw new AccountManagementError('invalid_request', 400);
    requireTargetConfirmation(targetId, body.data.confirmTarget);
    const command = parseMutation({
      ...body.data,
      targetId,
      challenge: '0'.repeat(32),
    });
    const admin = await accountAdmin();
    const audit = operationAudit(admin, actor, command);
    try {
      const human = {
        actorId: actor.id,
        sessionId: actor.sessionId,
        verifiedClaims: {},
      };
      await authorizeHuman(
        human,
        humanAuthority(admin, actor),
        Math.floor(Date.now() / 1000)
      );
      return await issueChallenge(await createChallengeStore(), {
        actorId: actor.id,
        sessionId: actor.sessionId,
        targetId,
        action: 'admin',
        bodyHash: mutationBodyHash(command),
      });
    } catch (error) {
      await audit('denied');
      throw error;
    }
  });
}

export function accountsMutate(
  request: Request,
  action: AccountMutation['action'],
  targetId?: string
) {
  return accountResponse(async () => {
    const actor = await resolveAccountActor(
      request,
      action === 'test-create' || action === 'test-delete'
    );
    if (targetId !== undefined && !z.uuid().safeParse(targetId).success)
      throw new AccountManagementError('not_found', 404);
    const command = parseMutation(await jsonBody(request));
    const route = { action, targetId };
    requireMutationRoute(command, route);
    if (request.headers.get('idempotency-key') !== command.operationId)
      throw new AccountManagementError('invalid_request', 400);
    const admin = await accountAdmin();
    const audit = operationAudit(admin, actor, command);
    if (command.action === 'disable' || command.action === 'delete') {
      await audit('denied');
      throw new AccountManagementError('d292_required', 503);
    }
    if (actor.kind === 'human') {
      return runHumanMutation({
        human: {
          actorId: actor.id,
          sessionId: actor.sessionId,
          verifiedClaims: {},
        },
        command,
        route,
        nowSeconds: Math.floor(Date.now() / 1000),
        dependencies: {
          authority: humanAuthority(admin, actor),
          challenges: {
            getdel: async (key) => (await createChallengeStore()).getdel(key),
          },
          appendAudit: ({ phase, targetId: target }) =>
            audit(phase, phase === 'success' ? target : undefined),
          execute: async (mutation) => ({
            status: 'completed',
            targetId: await executeHumanMutation(admin, actor, mutation),
          }),
        },
      });
    }
    if (command.action !== 'test-create' && command.action !== 'test-delete')
      throw new AccountManagementError('not_found', 404);
    try {
      if (command.action === 'test-delete')
        requireTargetConfirmation(command.targetId, command.confirmTarget);
      await audit('intent');
    } catch (error) {
      if (
        error instanceof AccountManagementError &&
        error.status < 500 &&
        error.code !== 'operation_conflict'
      )
        await audit('denied');
      throw error;
    }
    try {
      const target = await executeTestMutation(admin, actor, command);
      await audit('success', target);
      return {
        operationId: command.operationId,
        targetId: target,
        status: 'completed',
      };
    } catch (error) {
      if (error instanceof AccountManagementError && error.status === 429) {
        await audit('failure');
        throw error;
      }
      await audit('unknown').catch(() => undefined);
      return { operationId: command.operationId, status: 'unknown' };
    }
  });
}
