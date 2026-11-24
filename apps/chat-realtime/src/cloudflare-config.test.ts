import { afterEach, describe, expect, it, vi } from 'vitest';

async function config(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('CHAT_REALTIME_DEPLOY_ENV', env.CHAT_REALTIME_DEPLOY_ENV ?? '');
  vi.stubEnv(
    'CHAT_REALTIME_TOKEN_ROTATION',
    env.CHAT_REALTIME_TOKEN_ROTATION ?? ''
  );
  return (await import('../cloudflare.config')).default;
}

function declared(env: Record<string, unknown>) {
  return Object.entries(env)
    .filter(([, binding]) => Boolean(binding))
    .map(([name]) => name)
    .sort();
}

function expectNoPublicRoute(worker: Record<string, unknown>) {
  expect(worker.domains ?? []).toEqual([]);
  const triggers = (worker.triggers ?? []) as { type?: string }[];
  expect(triggers.filter(({ type }) => type === 'fetch')).toEqual([]);
  expect('routes' in worker).toBe(false);
}

const DEFAULT_ENV = [
  'CHAT_REALTIME_STOPPED',
  'CHAT_REALTIME_TOKEN_SECRET',
  'CONVERSATION',
  'INBOX',
];

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
    expect(worker.env.INBOX).toMatchObject({
      exportName: 'ChatInboxRoom',
      worker: 'tuturuuu-chat-realtime',
    });
    expectNoPublicRoute(worker as unknown as Record<string, unknown>);
  });

  it('gives staging its own Worker, namespaces and workers.dev only', async () => {
    const { worker } = await config({ CHAT_REALTIME_DEPLOY_ENV: 'staging' });
    expect(worker.name).toBe('tuturuuu-chat-realtime-staging');
    expect(worker.workersDev).toBe(true);
    expect(worker.previewUrls).toBe(false);
    expect(worker.env.INBOX).toMatchObject({
      exportName: 'ChatInboxRoom',
      worker: 'tuturuuu-chat-realtime-staging',
    });
    expect(worker.env.CONVERSATION).toMatchObject({
      exportName: 'ChatConversationRoom',
      worker: 'tuturuuu-chat-realtime-staging',
    });
    expect(JSON.stringify(worker.env)).not.toMatch(/"tuturuuu-chat-realtime"/u);
    expectNoPublicRoute(worker as unknown as Record<string, unknown>);
  });

  it('omits the previous ticket secret unless the build is a rotation overlap', async () => {
    for (const deployEnv of ['', 'staging']) {
      const { worker } = await config({ CHAT_REALTIME_DEPLOY_ENV: deployEnv });
      expect(declared(worker.env)).toEqual(DEFAULT_ENV);
    }
    const { worker } = await config({
      CHAT_REALTIME_TOKEN_ROTATION: 'overlap',
    });
    expect(declared(worker.env)).toEqual(
      [
        ...DEFAULT_ENV,
        'CHAT_REALTIME_TOKEN_PREVIOUS_SECRET',
        'CHAT_REALTIME_TOKEN_ROTATION',
      ].sort()
    );
    expect(worker.env.CHAT_REALTIME_TOKEN_ROTATION).toMatchObject({
      type: 'text',
      value: 'overlap',
    });
    expect(worker.env.CHAT_REALTIME_TOKEN_PREVIOUS_SECRET).toMatchObject({
      type: 'secret',
    });
  });

  it('treats any other deploy env as production', async () => {
    const { worker } = await config({ CHAT_REALTIME_DEPLOY_ENV: 'preview' });
    expect(worker.name).toBe('tuturuuu-chat-realtime');
    expect(worker.workersDev).toBe(false);
  });
});
