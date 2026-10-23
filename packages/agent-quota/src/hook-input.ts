import { HookError } from './hook-ledger';
import type { AdmissionRequest, SwitchEvidence } from './hooks-types';

export type Input = Record<string, unknown>;
export function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HookError('input-object-required');
  return value as Input;
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:._/%-]{1,512}$/.test(value))
    throw new HookError('input-identifier-invalid');
  return value;
}
export function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new HookError('input-timestamp-invalid');
  return new Date(value).toISOString();
}
export function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new HookError('input-number-invalid');
  return value;
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new HookError('input-boolean-required');
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new HookError('input-array-required');
  return value;
}
export const ids = (value: unknown) => array(value).map(id);
export function admissionInput(input: Input): AdmissionRequest {
  const recoveryInput =
    input.recovery === undefined ? undefined : object(input.recovery);
  const failure = recoveryInput?.failure;
  if (
    recoveryInput &&
    failure !== 'usage-limit' &&
    failure !== 'capacity' &&
    failure !== 'auth' &&
    failure !== 'other'
  )
    throw new HookError('recovery-failure-invalid');
  const recovery = recoveryInput
    ? {
        threadId: id(recoveryInput.threadId),
        runId: id(recoveryInput.runId),
        failure: failure as 'usage-limit' | 'capacity' | 'auth' | 'other',
      }
    : undefined;
  const requirements = object(input.requirements);
  const policy = object(input.policy);
  const capability = requirements.capability;
  if (
    capability !== 'implementation' &&
    capability !== 'analysis' &&
    capability !== 'review' &&
    capability !== 'research'
  )
    throw new HookError('capability-invalid');
  const taskClass = requirements.taskClass ?? 'standard';
  if (
    taskClass !== 'mechanical' &&
    taskClass !== 'standard' &&
    taskClass !== 'security-review'
  )
    throw new HookError('task-class-invalid');
  const preferenceWeights =
    policy.preferenceWeights === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(object(policy.preferenceWeights)).map(
            ([key, value]) => [id(key), number(value, 0, 100)]
          )
        );
  const unknownMaxConcurrent = number(policy.unknownMaxConcurrent, 0, 20);
  if (!Number.isInteger(unknownMaxConcurrent))
    throw new HookError('unknown-cap-invalid');
  return {
    requestId: id(input.requestId),
    recovery,
    threadId: id(input.threadId),
    currentInstanceId: id(input.currentInstanceId),
    requirements: {
      capability,
      taskClass,
      authorizedInstanceIds: ids(requirements.authorizedInstanceIds),
      privacyApprovedInstanceIds: ids(requirements.privacyApprovedInstanceIds),
      authorInstanceId:
        requirements.authorInstanceId === undefined
          ? undefined
          : id(requirements.authorInstanceId),
      candidates: array(requirements.candidates).map((value) => {
        const candidate = object(value);
        return {
          instanceId: id(candidate.instanceId),
          model: id(candidate.model),
          capabilities: ids(candidate.capabilities),
        };
      }),
    },
    policy: {
      unknownMaxConcurrent,
      preferenceWeights,
      orchestratorReservePercent: number(
        policy.orchestratorReservePercent,
        0,
        100
      ),
      nearUsedPercent: number(policy.nearUsedPercent, 1, 100),
    },
  };
}
export function switchInput(input: Input, accountKey: string): SwitchEvidence {
  const queue = object(input.queue);
  const children = object(input.children);
  const watches = object(input.watches);
  return {
    threadId: id(input.threadId),
    attemptId: id(input.attemptId),
    accountKey,
    observedAt: timestamp(input.observedAt),
    threadIdle: bool(input.threadIdle),
    queue: {
      threadId: id(queue.threadId),
      complete: bool(queue.complete),
      items: ids(queue.items),
    },
    unfinishedWriterIds: ids(input.unfinishedWriterIds),
    backgroundJobIds: ids(input.backgroundJobIds),
    uncertainMutationIds: ids(input.uncertainMutationIds),
    children: { preserved: bool(children.preserved), ids: ids(children.ids) },
    watches: { preserved: bool(watches.preserved), ids: ids(watches.ids) },
  };
}
