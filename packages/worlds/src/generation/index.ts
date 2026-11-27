import {
  type GenerationAttempt,
  type GenerationDependencies,
  type GenerationFailure,
  type GenerationJob,
  type GenerationKey,
  type GenerationPersistence,
  type GenerationRequest,
  type GenerationState,
  generationLimits,
} from './contract.ts';

import { parseWorldDraft } from './world-draft.ts';

export { parseWorldDraft } from './world-draft.ts';

export * from './contract.ts';

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const fileTypes = new Set([
  'application/json',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

function validateKey(key: GenerationKey) {
  for (const id of [key.workspaceId, key.worldId, key.requestId]) {
    if (typeof id !== 'string' || id.trim() !== id || !identifier.test(id)) {
      throw new TypeError('Invalid generation key');
    }
  }
}

function normalizeRequest(request: GenerationRequest): GenerationRequest {
  validateKey(request);

  if (
    !['prompt', 'image', 'file'].includes(request.kind) ||
    typeof request.instruction !== 'string' ||
    request.instruction.length > generationLimits.instructionLength ||
    !request.instruction.trim()
  ) {
    throw new TypeError('Invalid generation request');
  }

  const { workspaceId, worldId, requestId, kind, instruction } = request;
  const key = {
    workspaceId,
    worldId,
    requestId,
    instruction: instruction.trim(),
  };
  if (kind === 'prompt') return { ...key, kind };

  const source = request.source;
  if (
    !source ||
    typeof source.id !== 'string' ||
    !identifier.test(source.id) ||
    !(kind === 'image' ? imageTypes : fileTypes).has(source.mediaType) ||
    !Number.isSafeInteger(source.byteLength) ||
    source.byteLength < 1 ||
    source.byteLength > generationLimits.assetBytes
  ) {
    throw new TypeError('Invalid generation source');
  }

  return {
    ...key,
    kind,
    source: {
      id: source.id,
      mediaType: source.mediaType,
      byteLength: source.byteLength,
    },
  };
}

function sameRequest(
  left: GenerationRequest,
  right: GenerationRequest
): boolean {
  return JSON.stringify(normalizeRequest(left)) === JSON.stringify(right);
}

function transition(job: GenerationJob, state: GenerationState): GenerationJob {
  return { ...job, revision: job.revision + 1, state };
}

function failure(
  job: GenerationJob,
  reason: GenerationFailure,
  retryable = false
): GenerationState {
  return retryable && job.attempts < generationLimits.attempts
    ? { status: 'queued' }
    : { status: 'failed', reason };
}

export async function submitGeneration(
  persistence: GenerationPersistence,
  input: GenerationRequest
): Promise<GenerationJob> {
  const request = normalizeRequest(input);
  const { job } = await persistence.compareAndSet(null, {
    request,
    revision: 0,
    attempts: 0,
    state: { status: 'queued' },
  });
  if (!sameRequest(job.request, request)) {
    throw new Error('Generation key already belongs to a different request');
  }
  return job;
}

export async function cancelGeneration(
  persistence: GenerationPersistence,
  key: GenerationKey
): Promise<GenerationJob | null> {
  validateKey(key);
  let job = await persistence.read(key);
  while (job?.state.status === 'queued' || job?.state.status === 'running') {
    const result = await persistence.compareAndSet(
      job.revision,
      transition(job, { status: 'cancelled' })
    );
    job = result.job;
  }
  return job;
}

async function generate(
  dependencies: GenerationDependencies,
  job: GenerationJob,
  attempt: GenerationAttempt,
  expiresAt: number
): Promise<GenerationState> {
  let bytes: Uint8Array | undefined;
  if (job.request.kind !== 'prompt') {
    const source = job.request.source;
    const data = await Promise.resolve()
      .then(() => dependencies.assets.read(attempt, source))
      .catch(() => null);
    if (
      !(data instanceof Uint8Array) ||
      data.byteLength !== source.byteLength
    ) {
      return failure(job, 'input-unavailable');
    }
    bytes = data;
  }

  const current = await dependencies.persistence.read(job.request);
  if (attempt.signal.aborted || Date.now() >= expiresAt) {
    return failure(job, 'attempt-expired', true);
  }
  if (current?.revision !== job.revision) {
    return { status: 'cancelled' };
  }

  const output = await Promise.resolve()
    .then(() => dependencies.provider.generate(attempt, bytes))
    .catch(() => ({ kind: 'failure', retryable: false }) as const);
  if (output?.kind === 'failure' && typeof output.retryable === 'boolean') {
    return failure(job, 'provider', output.retryable);
  }
  if (output?.kind !== 'draft') return failure(job, 'invalid-output');
  const draft = parseWorldDraft(output.draft, job.request.worldId);
  return draft
    ? { status: 'succeeded', draft }
    : failure(job, 'invalid-output');
}

/**
 * Run at most one provider attempt. A queued result can be scheduled again.
 * Recover abandoned claims after expiry. CAS prevents stale results from
 * becoming visible after cancellation or recovery.
 */
export async function runGeneration(
  dependencies: GenerationDependencies,
  key: GenerationKey
): Promise<GenerationJob | null> {
  validateKey(key);
  const { persistence } = dependencies;
  const current = await persistence.read(key);
  if (!current) return null;

  if (current.state.status === 'running') {
    if (current.state.expiresAt > Date.now()) return current;
    const recovered = transition(
      current,
      failure(current, 'attempt-expired', true)
    );
    return (await persistence.compareAndSet(current.revision, recovered)).job;
  }
  if (current.state.status !== 'queued') return current;

  const expiresAt = Date.now() + generationLimits.attemptMs;
  const next = {
    ...transition(current, { status: 'running', expiresAt }),
    attempts: current.attempts + 1,
  };
  const { applied, job } = await persistence.compareAndSet(
    current.revision,
    next
  );
  if (!applied) return job;

  const controller = new AbortController();
  const expired = failure(job, 'attempt-expired', true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let state = expired;
    const remaining = expiresAt - Date.now();
    if (remaining > 0) {
      const deadline = new Promise<GenerationState>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(expired);
        }, remaining);
      });
      const attempt = {
        request: job.request,
        attempt: job.attempts,
        signal: controller.signal,
      };
      state = await Promise.race([
        deadline,
        generate(dependencies, job, attempt, expiresAt),
      ]);
      if (Date.now() >= expiresAt) state = expired;
    }
    return (
      await persistence.compareAndSet(job.revision, transition(job, state))
    ).job;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
