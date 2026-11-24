import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_NAME = 'CHAT_REALTIME_DEPLOY_ENV';

async function config(environment?: string) {
  vi.resetModules();
  if (environment) vi.stubEnv(ENV_NAME, environment);
  else vi.stubEnv(ENV_NAME, '');
  return (await import('../cloudflare.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chat-realtime Cloudflare config', () => {
  it('keeps production on the canonical name without workers.dev', async () => {
    const { worker } = await config();
    expect(worker.name).toBe('tuturuuu-chat-realtime');
    expect(worker.workersDev).toBe(false);
    expect(worker.previewUrls).toBe(false);
    expect(JSON.stringify(worker)).not.toContain('staging');
  });

  it('gives staging its own Worker, namespaces and workers.dev only', async () => {
    const { worker } = await config('staging');
    expect(worker.name).toBe('tuturuuu-chat-realtime-staging');
    expect(worker.workersDev).toBe(true);
    expect(worker.previewUrls).toBe(false);
    const text = JSON.stringify(worker.env);
    // Both Durable Object bindings point at the staging Worker, never at
    // production storage.
    expect(text.match(/tuturuuu-chat-realtime-staging/gu)).toHaveLength(2);
    expect(text).not.toMatch(/"tuturuuu-chat-realtime"/u);
    expect(Object.keys(worker.env).sort()).toEqual([
      'CHAT_REALTIME_STOPPED',
      'CHAT_REALTIME_TOKEN_PREVIOUS_SECRET',
      'CHAT_REALTIME_TOKEN_SECRET',
      'CONVERSATION',
      'INBOX',
    ]);
    expect('routes' in worker).toBe(false);
  });

  it('treats any other deploy env as production', async () => {
    const { worker } = await config('preview');
    expect(worker.name).toBe('tuturuuu-chat-realtime');
    expect(worker.workersDev).toBe(false);
  });
});
