import { digest } from '../cli/operational-schema';
import {
  type AssignmentInspectionScope,
  type AssignmentOutcome,
  type AssignmentReconciliationOutcome,
  type AssignmentReconciliationPort,
  type AtomicAssignmentPort,
  assignmentCommandSchema,
  assignmentInspectionAuthorizationSchema,
  assignmentReconciliationRequestSchema,
  assignmentReconciliationResultSchema,
  assignmentRequestSchema,
  assignmentTimeoutSchema,
  atomicAssignmentResultSchema,
  type PlannerContext,
} from './contracts';
import {
  plannerDenial,
  samePlannerIdentity,
  validatePlannerContext,
} from './planner';

export async function compareAndCreateOperationalTask({
  request: input,
  readCurrent,
  port,
  timeoutMs = 5_000,
}: {
  request: unknown;
  // Inject a trusted coordinator/source reader, never a caller's recommendation.
  readCurrent: () => Promise<unknown>;
  port: AtomicAssignmentPort;
  timeoutMs?: unknown;
}): Promise<AssignmentOutcome> {
  const parsed = assignmentRequestSchema.safeParse(input);
  if (!parsed.success) return { kind: 'denied', reason: 'invalid-request' };
  const timeout = assignmentTimeoutSchema.safeParse(timeoutMs);
  if (!timeout.success) return { kind: 'denied', reason: 'invalid-timeout' };
  const { recommendation: _recommendation, ...request } = parsed.data;
  let context: PlannerContext;
  try {
    context = validatePlannerContext(await readCurrent());
  } catch {
    return { kind: 'denied', reason: 'invalid-or-stale-current-context' };
  }
  if (
    !samePlannerIdentity(request.expected, context.expected) ||
    request.grantId !== context.grant.grantId ||
    request.owner !== context.grant.owner ||
    request.reservationId !== context.grant.reservationId
  )
    return { kind: 'denied', reason: 'request-authority-conflict' };
  const denial = plannerDenial(context, request.canonicalItemId);
  if (denial) return { kind: 'denied', reason: denial };
  const command = assignmentCommandSchema.parse({
    ...request,
    requestDigest: digest(request),
  });
  Object.freeze(command.expected);
  Object.freeze(command);
  // Exactly one port call. Any uncertain transport/receipt outcome keeps the same
  // operation identity unresolved; the caller must reconcile, never mint a retry key.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = atomicAssignmentResultSchema.parse(
      await Promise.race([
        port.compareAndCreate(command),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('assignment-timeout')),
            timeout.data
          );
        }),
      ])
    );
    if (result.kind === 'created' || result.kind === 'replayed') {
      if (
        result.operationId !== command.operationId ||
        result.requestDigest !== command.requestDigest ||
        result.sourceDatabaseId !== command.expected.sourceDatabaseId ||
        result.canonicalItemId !== command.canonicalItemId
      )
        return {
          kind: 'unresolved',
          operationId: command.operationId,
          requestDigest: command.requestDigest,
        };
    }
    return result;
  } catch {
    return {
      kind: 'unresolved',
      operationId: command.operationId,
      requestDigest: command.requestDigest,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function reconcileOperationalTaskAssignment({
  request: input,
  readCurrentAuthorization,
  port,
  timeoutMs = 5_000,
}: {
  request: unknown;
  readCurrentAuthorization: (
    scope: Readonly<AssignmentInspectionScope>
  ) => Promise<unknown>;
  port: AssignmentReconciliationPort;
  timeoutMs?: unknown;
}): Promise<AssignmentReconciliationOutcome> {
  const parsed = assignmentReconciliationRequestSchema.safeParse(input);
  if (!parsed.success)
    return { kind: 'denied', reason: 'invalid-reconciliation-request' };
  const { recommendation: _recommendation, ...originalRequest } =
    parsed.data.originalRequest;
  if (digest(originalRequest) !== parsed.data.requestDigest)
    return { kind: 'conflict', reason: 'original-request-digest-conflict' };
  const original = assignmentCommandSchema.parse({
    ...originalRequest,
    requestDigest: parsed.data.requestDigest,
  });
  Object.freeze(original.expected);
  Object.freeze(original);
  const scope = Object.freeze({
    sourceDatabaseId: original.expected.sourceDatabaseId,
    canonicalItemId: original.canonicalItemId,
    operationId: original.operationId,
  });
  const unresolved = {
    kind: 'unresolved',
    operationId: original.operationId,
    requestDigest: original.requestDigest,
  } as const;
  const timeout = assignmentTimeoutSchema.safeParse(timeoutMs);
  if (!timeout.success) return { kind: 'denied', reason: 'invalid-timeout' };
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inspect = async (): Promise<AssignmentReconciliationOutcome> => {
    const parsedAuthorization =
      assignmentInspectionAuthorizationSchema.safeParse(
        await readCurrentAuthorization(scope)
      );
    if (expired) return unresolved;
    if (!parsedAuthorization.success)
      return { kind: 'denied', reason: 'invalid-current-inspection-authority' };
    const authorization = parsedAuthorization.data;
    if (
      !authorization.principal.authenticated ||
      !authorization.policy.allowed ||
      authorization.scope.sourceDatabaseId !== scope.sourceDatabaseId ||
      authorization.scope.canonicalItemId !== scope.canonicalItemId ||
      authorization.scope.operationId !== scope.operationId
    )
      return { kind: 'denied', reason: 'current-inspection-policy-denied' };
    Object.freeze(authorization.principal);
    Object.freeze(authorization.scope);
    Object.freeze(authorization.policy);
    Object.freeze(authorization);
    const command = Object.freeze({ original, authorization });
    const result = assignmentReconciliationResultSchema.parse(
      await port.readOriginalReceipt(command)
    );
    if (
      result.kind === 'reconciled' &&
      (result.receipt.operationId !== original.operationId ||
        result.receipt.requestDigest !== original.requestDigest ||
        result.receipt.sourceDatabaseId !== scope.sourceDatabaseId ||
        result.receipt.canonicalItemId !== scope.canonicalItemId)
    )
      return unresolved;
    return result;
  };
  try {
    return await Promise.race([
      inspect(),
      new Promise<AssignmentReconciliationOutcome>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve(unresolved);
        }, timeout.data);
      }),
    ]);
  } catch {
    return unresolved;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
