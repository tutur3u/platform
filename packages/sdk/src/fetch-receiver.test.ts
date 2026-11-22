import { afterEach, expect, it, vi } from 'vitest';
import { EpmClient } from './epm';
import { bindGlobalFetch } from './fetch-receiver';
import { TuturuuuUserClient } from './platform';
import { TuturuuuClient } from './storage';

const apiKey = 'ttr_receiver_fixture';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubWorkerFetch(payload: object) {
  const workerFetch = vi.fn(function (this: typeof globalThis) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json(payload));
  });
  vi.stubGlobal('fetch', workerFetch);
  return workerFetch;
}

it('uses the Worker fetch receiver for a platform session request', async () => {
  const payload = { ok: true };
  const workerFetch = stubWorkerFetch(payload);
  const client = new TuturuuuUserClient({
    accessToken: 'fixture-session',
    baseUrl: 'https://tuturuuu.com',
  });
  const response = await client
    .getClientOptions()
    .fetch?.('https://tuturuuu.com/api/v1/workspaces');

  expect(response?.status).toBe(200);
  expect(await response?.json()).toEqual(payload);
  expect(workerFetch).toHaveBeenCalledTimes(1);
});

it('uses the Worker fetch receiver for an EPM summary read', async () => {
  const payload = { workspaceId: 'workspace-1' };
  const workerFetch = stubWorkerFetch(payload);
  const client = new EpmClient({ apiKey });

  await expect(client.getSummary('workspace-1')).resolves.toEqual(payload);
  expect(workerFetch).toHaveBeenCalledTimes(1);
});

it.each(['key', 'config', 'explicit global', 'environment'] as const)(
  'uses the Worker fetch receiver for storage with %s configuration',
  async (configuration) => {
    const payload = {
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    };
    const workerFetch = stubWorkerFetch(payload);
    vi.stubEnv('TUTURUUU_API_KEY', apiKey);
    const configs = {
      key: apiKey,
      config: { apiKey },
      'explicit global': { apiKey, fetch: workerFetch },
      environment: undefined,
    };
    const client = new TuturuuuClient(configs[configuration]);

    await expect(client.storage.list()).resolves.toEqual(payload);
    expect(workerFetch).toHaveBeenCalledTimes(1);
  }
);

it('preserves the receiver of a custom storage fetch callback', async () => {
  const payload = { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
  const customFetch = vi.fn(function (this: TuturuuuClient) {
    expect(this).toBe(client);
    return Promise.resolve(Response.json(payload));
  });
  const client = new TuturuuuClient({ apiKey, fetch: customFetch });

  await expect(client.storage.list()).resolves.toEqual(payload);
  expect(customFetch).toHaveBeenCalledTimes(1);
});

it('keeps the runtime fallback for a JavaScript null fetch option', async () => {
  const payload = { ok: true };
  const workerFetch = stubWorkerFetch(payload);
  const dependency = { fetch: bindGlobalFetch(null) };

  const response = await dependency.fetch('https://example.test');

  expect(await response.json()).toEqual(payload);
  expect(workerFetch).toHaveBeenCalledTimes(1);
});
