import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  judge: vi.fn(),
  playground: vi.fn(),
  count: vi.fn(),
}));
vi.mock('./devbox-judge-sandbox', () => ({ getJudgeReadiness: mocks.judge }));
vi.mock('./devbox-playground-sandbox', () => ({
  getPlaygroundReadiness: mocks.playground,
  playgroundEnvironmentCount: mocks.count,
}));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    spawn: vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(),
      });
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('fixture 1'));
        child.emit('close', 0);
      });
      return child;
    }),
  };
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', '');
  mocks.judge.mockResolvedValue({
    ready: true,
    languages: ['python'],
    reason: null,
  });
  mocks.playground.mockResolvedValue({
    ready: true,
    languages: ['python', 'shell'],
    environments: 0,
  });
  mocks.count.mockReturnValue(2);
});
afterEach(() => vi.unstubAllEnvs());
async function collect() {
  return (
    await import('./devbox-agent-capabilities')
  ).createDevboxAgentCapabilities();
}
it('keeps unconfigured existing Judge heartbeat payloads unchanged and skips playground probes', async () => {
  const capabilities = await collect();
  expect(capabilities).not.toHaveProperty('playground');
  expect(capabilities.judge).toMatchObject({ ready: true });
  expect(mocks.playground).not.toHaveBeenCalled();
});
it.each(['bad owner!', '../pool', 'x'.repeat(41)])(
  'does not opt malformed pool identity into new heartbeat fields: %s',
  async (pool) => {
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', pool);
    expect(await collect()).not.toHaveProperty('playground');
    expect(mocks.playground).not.toHaveBeenCalled();
  }
);
it('reports opted-in readiness with the current live environment count', async () => {
  vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', 'separate-pool');
  expect(await collect()).toHaveProperty('playground', {
    ready: true,
    languages: ['python', 'shell'],
    environments: 2,
  });
  mocks.count.mockReturnValue(3);
  expect((await collect()).playground?.environments).toBe(3);
});
it('keeps explicitly opted-in unavailable pools visible as not ready', async () => {
  vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', 'separate-pool');
  mocks.playground.mockResolvedValue({
    ready: false,
    languages: [],
    environments: 0,
  });
  expect((await collect()).playground).toEqual({
    ready: false,
    languages: [],
    environments: 2,
  });
});
