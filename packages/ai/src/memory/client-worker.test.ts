import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryServiceClient, AiMemoryWriteRejectedError } from './client';
import { getAiMemoryConfig } from './config';

const workerCredential = crypto.randomUUID();
const legacyCredential = crypto.randomUUID();
const workerOrigin = 'https://memory.invalid';
const payload = {
  containerTag: 'tuturuuu.user.actor.workspace.one',
  customId: 'tuturuuu.mira.chat.thread',
  content: 'First captured memory',
  embedding: [0.1],
  metadata: { source: 'chat', wsId: 'one' },
};

function configureWorker() {
  vi.stubEnv('MEMORY_ASSISTANT_WORKER_ENABLED', 'true');
  vi.stubEnv('MEMORY_ASSISTANT_WORKER_URL', workerOrigin);
  vi.stubEnv('MEMORY_ASSISTANT_CALLER_SECRET', workerCredential);
  const config = getAiMemoryConfig();
  if (!config) throw new Error('Expected Worker config');
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('assistant Memory Worker transport', () => {
  it('requires explicit opt-in and keeps the legacy credential out of Worker requests', async () => {
    vi.stubEnv('MEMORY_ASSISTANT_WORKER_ENABLED', undefined);
    vi.stubEnv('MEMORY_ASSISTANT_WORKER_URL', workerOrigin);
    vi.stubEnv('MEMORY_ASSISTANT_CALLER_SECRET', workerCredential);
    vi.stubEnv('SUPERMEMORY_ENABLED', 'false');
    expect(getAiMemoryConfig()).toBeNull();

    vi.stubEnv('SUPERMEMORY_ENABLED', 'true');
    vi.stubEnv('SUPERMEMORY_API_KEY', legacyCredential);
    vi.stubEnv('SUPERMEMORY_BASE_URL', 'http://legacy.invalid');
    expect(getAiMemoryConfig()).toMatchObject({ apiKey: legacyCredential });
    vi.stubEnv('MEMORY_ASSISTANT_WORKER_ENABLED', 'true');
    expect(getAiMemoryConfig()).toMatchObject({
      apiKey: workerCredential,
      baseUrl: workerOrigin,
    });

    vi.stubEnv('MEMORY_ASSISTANT_CALLER_SECRET', undefined);
    expect(getAiMemoryConfig()).toBeNull();
  });

  it.each([
    'http://memory.invalid',
    'https://user@memory.invalid',
    'https://memory.invalid/other',
    'https://memory.invalid/?different=true',
  ])('fails closed with an invalid Worker origin (%s)', (origin) => {
    configureWorker();
    vi.stubEnv('MEMORY_ASSISTANT_WORKER_URL', origin);
    expect(getAiMemoryConfig()).toBeNull();
  });

  it('keeps retries stable while isolating containers and distinct source content', async () => {
    const fetchMock = vi.fn(
      async (_url: URL | RequestInfo, _init?: RequestInit) =>
        Response.json({ id: 'memory-row', status: 'done', revision: '12' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AiMemoryServiceClient(configureWorker());
    const write = await client.add(payload);
    expect(await client.add(payload)).toEqual(write);
    await client.add({
      ...payload,
      containerTag: 'tuturuuu.user.actor.workspace.two',
    });
    await client.add({ ...payload, content: 'Next captured memory' });

    const bodies = fetchMock.mock.calls.map(([, init]) => {
      if (typeof init?.body !== 'string') throw new Error('Expected JSON');
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${workerCredential}`,
      });
      expect(init.redirect).toBe('error');
      return JSON.parse(init.body);
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      Array.from({ length: 4 }, () => `${workerOrigin}/v1/memories`)
    );
    expect(bodies[0]).toEqual({
      ...payload,
      customId: write.replacement?.customId,
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(
      new Set([bodies[0].customId, bodies[2].customId, bodies[3].customId]).size
    ).toBe(3);
    expect(write.replacement).toMatchObject({ revision: '12' });
  });

  it('does not confirm a Worker write without a committed revision receipt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 'memory-row', status: 'done' }))
    );
    const client = new AiMemoryServiceClient(configureWorker());
    await expect(client.add(payload)).rejects.toThrow('invalid add receipt');
  });

  it('rejects an existing forgotten row without trying to write a new identity', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: 'memory-row', status: 'forgotten', revision: '12' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AiMemoryServiceClient(configureWorker());
    await expect(client.add(payload)).rejects.toThrow(
      AiMemoryWriteRejectedError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
