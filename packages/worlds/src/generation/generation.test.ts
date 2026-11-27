import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import { it } from 'node:test';
import type { World } from '../runtime.ts';
import {
  cancelGeneration,
  type GenerationDependencies,
  type GenerationJob,
  type GenerationKey,
  type GenerationRequest,
  generationLimits,
  runGeneration,
  submitGeneration,
} from './index.ts';

const draft = {
  schemaVersion: 1,
  id: 'world',
  bounds: { width: 10, depth: 10 },
  spawns: [{ x: 1, z: 1, heading: 0 }],
  objects: [],
  assets: [],
} satisfies World;

function fixture() {
  const jobs = new Map<string, GenerationJob>();
  const keyOf = ({ workspaceId, worldId, requestId }: GenerationKey) =>
    JSON.stringify([workspaceId, worldId, requestId]);
  const deps: GenerationDependencies = {
    persistence: {
      async read(key) {
        return jobs.get(keyOf(key)) ?? null;
      },
      async compareAndSet(expected, next) {
        const key = keyOf(next.request);
        const current = jobs.get(key);
        if (current && current.revision !== expected) {
          return { applied: false, job: current };
        }
        strictEqual(expected, current?.revision ?? null);
        jobs.set(key, next);
        return { applied: true, job: next };
      },
    },
    provider: {
      async generate() {
        return { kind: 'draft', draft };
      },
    },
    assets: {
      async read() {
        throw new Error('Unexpected storage call');
      },
    },
  };
  const request: GenerationRequest = {
    workspaceId: 'workspace',
    worldId: 'world',
    requestId: 'request',
    kind: 'prompt',
    instruction: 'Describe a village',
  };
  return { deps, request };
}

it('validates requests and scopes idempotency to a world and workspace', async () => {
  const { deps, request } = fixture();
  const { persistence } = deps;
  await rejects(
    submitGeneration(persistence, { ...request, worldId: '../' }),
    TypeError
  );
  await rejects(
    submitGeneration(persistence, { ...request, instruction: '   ' }),
    TypeError
  );
  await rejects(
    submitGeneration(persistence, {
      ...request,
      instruction: 'a'.repeat(4001),
    }),
    TypeError
  );
  const first = await submitGeneration(persistence, request);
  deepStrictEqual(
    await submitGeneration(persistence, {
      ...request,
      instruction: ' Describe a village ',
    }),
    first
  );
  await rejects(
    submitGeneration(persistence, { ...request, instruction: 'Make a town' }),
    /different request/
  );
  for (const scope of [
    { worldId: 'another-world' },
    { workspaceId: 'another-workspace' },
  ]) {
    strictEqual(
      (
        await submitGeneration(persistence, {
          ...request,
          ...scope,
        })
      ).request.kind,
      'prompt'
    );
  }
});

it('runs one provider call across concurrent runners and replays the terminal result', async () => {
  const { deps, request } = fixture();
  let calls = 0;
  deps.provider.generate = async () => {
    calls++;
    return { kind: 'draft', draft };
  };
  await submitGeneration(deps.persistence, request);
  await Promise.all([
    runGeneration(deps, request),
    runGeneration(deps, request),
  ]);
  const done = await runGeneration(deps, request);
  deepStrictEqual(done?.state, {
    status: 'succeeded',
    draft,
  });
  deepStrictEqual(await submitGeneration(deps.persistence, request), done);
  strictEqual(calls, 1);
});

for (const [kind, mediaType] of [
  ['image', 'image/png'],
  ['file', 'text/plain'],
] as const) {
  it(`uses the validated ${kind} input to generate a world draft`, async () => {
    const { deps, request } = fixture();
    const source = { id: 'upload', mediaType, byteLength: 3 };
    const input = { ...request, kind, source };
    const bytes = Uint8Array.of(1, 2, 3);
    deps.assets.read = async (attempt, reference) => {
      deepStrictEqual(attempt.request, input);
      deepStrictEqual(reference, source);
      return bytes;
    };
    deps.provider.generate = async (_, uploaded) => {
      deepStrictEqual(uploaded, bytes);
      return { kind: 'draft', draft };
    };
    await submitGeneration(deps.persistence, input);
    await rejects(
      submitGeneration(deps.persistence, {
        ...input,
        source: { ...source, id: 'different-upload' },
      }),
      /different request/
    );
    deepStrictEqual((await runGeneration(deps, input))?.state, {
      status: 'succeeded',
      draft,
    });
  });
}

it('rejects invalid references, inaccessible uploads, and invalid world output', async () => {
  const { deps, request } = fixture();
  const source = { id: 'upload', mediaType: 'image/png', byteLength: 3 };
  await rejects(
    submitGeneration(deps.persistence, {
      ...request,
      kind: 'image',
      source: { ...source, byteLength: generationLimits.assetBytes + 1 },
    }),
    TypeError
  );
  const image = {
    ...request,
    requestId: 'image',
    kind: 'image' as const,
    source,
  };
  deps.assets.read = async () => Uint8Array.of(1);
  deps.provider.generate = async () => {
    throw new Error('Unexpected provider call');
  };
  await submitGeneration(deps.persistence, image);
  deepStrictEqual((await runGeneration(deps, image))?.state, {
    status: 'failed',
    reason: 'input-unavailable',
  });

  deps.provider.generate = async () => ({
    kind: 'draft',
    draft: { ...draft, spawns: [{ x: -1, z: 0, heading: 0 }] },
  });
  await submitGeneration(deps.persistence, request);
  deepStrictEqual((await runGeneration(deps, request))?.state, {
    status: 'failed',
    reason: 'invalid-output',
  });
});

it('stops after the durable attempt budget and recovers an expired claim', async () => {
  const { deps, request } = fixture();
  const initial = await submitGeneration(deps.persistence, request);
  await deps.persistence.compareAndSet(initial.revision, {
    ...initial,
    revision: 1,
    attempts: 1,
    state: { status: 'running', expiresAt: 0 },
  });
  let calls = 0;
  deps.provider.generate = async () => {
    calls++;
    return { kind: 'failure', retryable: true };
  };
  strictEqual((await runGeneration(deps, request))?.state.status, 'queued');
  strictEqual((await runGeneration(deps, request))?.state.status, 'queued');
  const failed = await runGeneration(deps, request);
  deepStrictEqual(failed?.state, { status: 'failed', reason: 'provider' });
  strictEqual(failed?.attempts, generationLimits.attempts);
  deepStrictEqual(await runGeneration(deps, request), failed);
  strictEqual(calls, generationLimits.attempts - 1);
});

it('cancels queued work and fences an in-flight draft', async () => {
  const { deps, request } = fixture();
  const queued = { ...request, requestId: 'queued' };
  await submitGeneration(deps.persistence, queued);
  await cancelGeneration(deps.persistence, queued);
  strictEqual((await runGeneration(deps, queued))?.attempts, 0);
  await submitGeneration(deps.persistence, request);

  deps.provider.generate = async () => {
    await cancelGeneration(deps.persistence, request);
    return { kind: 'draft', draft };
  };
  strictEqual((await runGeneration(deps, request))?.state.status, 'cancelled');
});
