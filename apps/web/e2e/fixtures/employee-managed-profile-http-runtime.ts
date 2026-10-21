import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { EmployeeCreationReplySchema } from '../../../../packages/internal-api/src/infrastructure/employee-creation';
import { updateManagedEmployeeProfile } from '../../../../packages/utils/src/internal-accounts/employee-managed-profile';
import { createEmployeeManagementTransport } from '../../../../packages/utils/src/internal-accounts/employee-management-rpc';
import type { createEmployeeRuntimeRpc } from '../../src/lib/infrastructure/employee-creation-rpc';

/** Actual PostgREST transactions in the same owned full-schema disposable project. */
export async function qualifyManagedProfileHttp(input: {
  url: string;
  key: string;
  anonKey: string;
  actorUserId: string;
  transport: ReturnType<typeof createEmployeeRuntimeRpc>;
  createTarget(): Promise<{ id: string; email: string; operationId: string }>;
}) {
  let assertions = 0;
  const check = (value: unknown) => {
    assert.ok(value);
    assertions++;
  };
  const target = await input.createTarget();
  const operationId = randomUUID();
  let writes = 0;
  const profile = await updateManagedEmployeeProfile({
    ...input,
    targetUserId: target.id,
    email: target.email,
    displayName: 'Duyên Dương',
    username: 'hehe',
    operationId,
    authorize: async (actor) => actor === input.actorUserId,
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      if (String(url).endsWith('/rpc/update_employee_profile')) {
        writes++;
        check(response.ok);
        // Consume the actual committed reply, then simulate losing it at the client.
        await response.arrayBuffer();
        throw new Error('Synthetic lost acknowledgement');
      }
      return response;
    },
  });
  check(writes === 1);
  check(profile?.displayName === 'Duyên Dương');
  check(profile?.username === 'hehe');
  const observed = await input.transport.inspect(
    input.actorUserId,
    target.operationId
  );
  check(observed.account?.displayName === 'Duyên Dương');
  check(observed.account?.creationDisplayName === 'Managed HTTP Original');
  check(observed.operation?.displayName === 'Managed HTTP Original');
  check(
    !EmployeeCreationReplySchema.safeParse({
      status: 'created',
      operationId: target.operationId,
      account: {
        id: target.id,
        email: target.email,
        displayName: 'Duyên Dương',
        creationDisplayName: 'Managed HTTP Original',
      },
    }).success
  );
  const call = createEmployeeManagementTransport({
    ...input,
    authorize: async () => true,
  });
  assert.ok(profile);
  const payload = {
    p_actor_id: input.actorUserId,
    p_user_id: target.id,
    p_email: target.email,
    p_expected_revision: 0,
    p_operation_id: operationId,
    p_name: profile.displayName,
    p_handle: profile.username,
  };
  const replay = await call(
    'update_employee_profile',
    input.actorUserId,
    payload
  );
  check(
    !replay.error && typeof replay.data === 'object' && replay.data !== null
  );
  const conflict = await call('update_employee_profile', input.actorUserId, {
    ...payload,
    p_name: 'Forged payload',
  });
  check(conflict.error?.code === '23505');
  const stale = await call('update_employee_profile', input.actorUserId, {
    ...payload,
    p_operation_id: randomUUID(),
  });
  check(stale.error?.code === '23514');
  const denied = await fetch(
    new URL('/rest/v1/rpc/update_employee_profile', input.url),
    {
      method: 'POST',
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.anonKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }
  );
  check(denied.status === 401 || denied.status === 403);
  const usernameLengths = [4];
  const duplicateTarget = await input.createTarget();
  const receiptSchema = z.object({
    operationId: z.uuid(),
    id: z.uuid(),
    username: z.string(),
    revision: z.number(),
  });
  for (const username of [
    'q',
    'a'.repeat(33),
    'b'.repeat(65),
    'c'.repeat(81),
    'x'.repeat(1001),
  ]) {
    const candidate = await input.createTarget();
    const request = {
      p_actor_id: input.actorUserId,
      p_user_id: candidate.id,
      p_email: candidate.email,
      p_expected_revision: 0,
      p_operation_id: randomUUID(),
      p_name: 'Duyên Dương',
      p_handle: username,
    };
    const saved = await call(
      'update_employee_profile',
      input.actorUserId,
      request
    );
    check(!saved.error);
    const receipt = receiptSchema.parse(saved.data);
    check(
      receipt.username === username &&
        receipt.revision === 1 &&
        receipt.id === candidate.id
    );
    const inspected = await call(
      'inspect_employee_profile_operation',
      input.actorUserId,
      {
        p_actor_id: input.actorUserId,
        p_user_id: candidate.id,
        p_email: candidate.email,
        p_operation_id: request.p_operation_id,
      }
    );
    check(!inspected.error);
    const independent = z
      .object({ receipt: receiptSchema })
      .parse(inspected.data);
    check(isDeepStrictEqual(independent.receipt, receipt));
    const repeated = await call(
      'update_employee_profile',
      input.actorUserId,
      request
    );
    check(
      !repeated.error &&
        isDeepStrictEqual(receiptSchema.parse(repeated.data), receipt)
    );
    const staleRevision = await call(
      'update_employee_profile',
      input.actorUserId,
      {
        ...request,
        p_operation_id: randomUUID(),
      }
    );
    check(staleRevision.error?.code === '23514');
    const duplicate = await call('update_employee_profile', input.actorUserId, {
      ...request,
      p_user_id: duplicateTarget.id,
      p_email: duplicateTarget.email,
      p_operation_id: randomUUID(),
    });
    check(duplicate.error?.code === '23505');
    usernameLengths.push(username.length);
  }
  return {
    qualified: true,
    assertions,
    writes,
    usernameLengths,
    lostAcknowledgementReadback: true,
    routeAuthorizationProof: false,
    productionProof: false,
  };
}
