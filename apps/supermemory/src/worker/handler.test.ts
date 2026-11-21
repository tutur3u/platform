import { PEOPLE_ISOLATION_CASES } from '@tuturuuu/ai/memory/people-namespace';
import { describe, expect, it, vi } from 'vitest';
import { type CallerSecrets, handleMemoryRequest } from './handler';
import worker from './index';
import { MAX_BODY_BYTES, operations, VECTOR_DIMENSIONS } from './protocol';

const assistantSecret = crypto.randomUUID();
const peopleSecret = crypto.randomUUID();
const unknownSecret = crypto.randomUUID();
const secrets = {
  MEMORY_ASSISTANT_CALLER_SECRET: assistantSecret,
  MEMORY_PEOPLE_CALLER_SECRET: peopleSecret,
};

const fixtures = {
  id: 'sample-id',
  content: 'Remember this',
  embedding: Array.from({ length: VECTOR_DIMENSIONS }, () => 0.5),
  expectedRevision: '0',
  requestId: crypto.randomUUID(),
  metadata: { consentVersion: 3, provenance: { manager: 'actor' } },
};

function request(path: string, token: string | undefined, body: string) {
  return new Request(new URL(path, 'https://memory.invalid'), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    method: 'POST',
    body,
  });
}

describe('Memory Worker request admission', () => {
  for (const example of PEOPLE_ISOLATION_CASES) {
    it(example.name, async () => {
      const [path] =
        Object.entries(operations).find(
          ([, entry]) => entry.operation === example.request.operation
        ) ?? [];
      if (!path) throw new Error('Untested operation');

      const token =
        example.caller.id === 'people-registry'
          ? peopleSecret
          : example.caller.id === 'assistant'
            ? assistantSecret
            : unknownSecret;
      const store = vi.fn(async () => ({ body: { ok: true } }));
      const body = {
        ...fixtures,
        ...example.request,
        containerTag: example.request.containerTags[0],
        caller: 'people-registry',
      };
      const response = await handleMemoryRequest(
        request(path, token, JSON.stringify(body)),
        secrets,
        store
      );

      if (example.expect === true) {
        expect(response.status).toBe(200);
        expect(store).toHaveBeenCalledTimes(1);
        expect(store.mock.calls[0]).toEqual([
          example.caller.id,
          expect.objectContaining({ operation: example.request.operation }),
        ]);
      } else {
        expect(response.status).toBe(token === unknownSecret ? 401 : 403);
        expect(await response.json()).toEqual({
          error: token === unknownSecret ? 'unauthorized' : example.expect,
        });
        expect(store).not.toHaveBeenCalled();
      }
    });
  }

  it.each([
    [undefined, secrets],
    [unknownSecret, secrets],
    [assistantSecret, {}],
    [
      peopleSecret,
      {
        MEMORY_ASSISTANT_CALLER_SECRET: peopleSecret,
        MEMORY_PEOPLE_CALLER_SECRET: peopleSecret,
      },
    ],
  ] satisfies [string | undefined, CallerSecrets][])(
    'rejects missing, unknown, or ambiguous credentials without a storage operation',
    async (secret, config) => {
      const store = vi.fn();
      const response = await handleMemoryRequest(
        request('/v1/memories', secret, '{}'),
        config,
        store
      );
      expect(response.status).toBe(401);
      expect(store).not.toHaveBeenCalled();
    }
  );

  it('rejects an oversized streamed body before storage', async () => {
    const store = vi.fn();
    const response = await handleMemoryRequest(
      request('/v1/memories', assistantSecret, ' '.repeat(MAX_BODY_BYTES + 1)),
      secrets,
      store
    );
    expect(response.status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it('never opens a database binding while the Worker is disabled', async () => {
    const response = await worker.fetch(
      request('/v1/memories', assistantSecret, '{}'),
      {
        ...secrets,
        get MEMORY_DB(): never {
          throw new Error('The database binding was accessed');
        },
      }
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
