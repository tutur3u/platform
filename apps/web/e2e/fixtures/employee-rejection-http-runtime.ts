import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { EmployeeOperationSnapshotSchema } from '../../src/lib/infrastructure/employee-creation-operation-store';
import type { EmployeeRuntimeRpc } from '../../src/lib/infrastructure/employee-creation-rpc';
import { adjudicateEmployeeCreationRejection } from '../../src/lib/infrastructure/employee-rejection-adjudication';

// Called only inside the canonical disposable GoTrue/PostgREST fixture.
export async function qualifyEmployeeRejectionHttp(input: {
  url: string;
  key: string;
  projectId: string;
  actorUserId: string;
  admin: SupabaseClient;
  transport: EmployeeRuntimeRpc;
  complete: (
    operationId: string,
    email: string
  ) => Promise<{ targetUserId: string; outcome: { status: string } }>;
}) {
  const operationId = randomUUID();
  const email = `http-adjudicated-${randomUUID()}@tuturuuu.com`;
  const claimed = z
    .strictObject({
      kind: z.literal('claimed'),
      operation: EmployeeOperationSnapshotSchema,
    })
    .parse(
      await input.transport.rpc.claim({
        actorUserId: input.actorUserId,
        operationId,
        email,
        displayName: 'Adjudicated Employee',
      })
    );
  assert.equal(claimed.kind, 'claimed');
  const op = claimed.operation;
  const leaseId = z.uuid().parse(op.leaseId);
  const attemptedEvent = randomUUID();
  await input.transport.rpc.advance({
    actorUserId: input.actorUserId,
    operationId,
    leaseId,
    expectedVersion: 0,
    eventId: attemptedEvent,
    nextPhase: 'auth_attempted',
    receipt: null,
  });
  const rejected = await input.admin.auth.admin.createUser({
    id: op.targetUserId,
    email,
    password: 'x',
    email_confirm: true,
    ban_duration: '876000h',
    app_metadata: { employee_onboarding: true },
  });
  assert.equal(rejected.error?.status, 422);
  assert.equal(rejected.error?.code, 'weak_password');
  await input.transport.rpc.advance({
    actorUserId: input.actorUserId,
    operationId,
    leaseId,
    expectedVersion: 1,
    eventId: randomUUID(),
    nextPhase: 'unknown',
    receipt: null,
  });
  // Fixture-only expiry; production RPC never accepts an expiry override.
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${input.projectId}`,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: `update private.employee_creation_operations set lease_expires_at=clock_timestamp()-interval '1 second' where actor_id='${input.actorUserId}' and operation_id='${operationId}';`,
      timeout: 10000,
      maxBuffer: 262144,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  const request = {
    actorUserId: input.actorUserId,
    operationId,
    targetUserId: op.targetUserId,
    email,
    displayName: op.displayName,
    expectedVersion: 2,
    originalLeaseId: leaseId,
    originalAttemptEventId: attemptedEvent,
    eventId: randomUUID(),
    evidenceReferenceSha256: 'a'.repeat(64),
    reason: 'administrator_adjudicated_terminal_auth_rejection',
    attestation: {
      kind: 'administrator-adjudication-v1',
      terminalAuthRejection: true,
      noRequestInFlight: true,
      absenceIsNotRejectionProof: true,
      acceptResponsibility: true,
    },
  };
  const call = async (body: object) => {
    const response = await fetch(
      new URL('/rest/v1/rpc/adjudicate_employee_creation_rejection', input.url),
      {
        method: 'POST',
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
      }
    );
    assert.equal(response.ok, true);
    return response.json();
  };
  const repaired = await adjudicateEmployeeCreationRejection({
    request,
    call,
    authorize: async () => {
      await input.transport.ready(input.actorUserId);
      return { actorUserId: input.actorUserId };
    },
  });
  const observed = await input.transport.inspect(
    input.actorUserId,
    operationId
  );
  assert.deepEqual(observed.operation, repaired.operation);
  assert.equal(observed.account, null);
  await assert.rejects(
    adjudicateEmployeeCreationRejection({
      request,
      call,
      authorize: async () => ({ actorUserId: input.actorUserId }),
    })
  );
  const completed = await input.complete(operationId, email);
  assert.equal(completed.targetUserId, op.targetUserId);
  assert.equal(completed.outcome.status, 'created');
  const final = await input.transport.inspect(input.actorUserId, operationId);
  assert.equal(final.operation?.phase, 'active');
  assert.equal(final.account?.id, op.targetUserId);
}
