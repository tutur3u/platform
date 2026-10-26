import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { executeJob, pollJobs } = vi.hoisted(() => ({
  executeJob: vi.fn(),
  pollJobs: vi.fn(),
}));
vi.mock('../platform-devbox', () => ({ pollDevboxAgentJobs: pollJobs }));
vi.mock('./devbox-runner', () => ({ executeDevboxAgentJob: executeJob }));
vi.mock('./devbox-agent-capabilities', () => ({
  createDevboxAgentCapabilities: vi.fn().mockResolvedValue({}),
  heartbeatStorageTrigger: vi.fn().mockResolvedValue(undefined),
}));

import { runDevboxAgentLoop } from './devbox-agent';

beforeEach(() => {
  executeJob.mockReset();
  pollJobs.mockReset();
  vi.stubEnv('TUTURUUU_DEVBOX_CONTROL_URL', '');
  vi.stubEnv('TUTURUUU_DEVBOX_AUTO_UPGRADE', 'false');
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response('{}')
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Calls the agent's own handler instead of emitting a real process signal,
// which would also reach the test runner's listeners.
function agentHandler(
  signal: 'SIGTERM' | 'SIGINT',
  before: ReturnType<typeof process.listeners>
) {
  const handler = process
    .listeners(signal)
    .find((listener) => !before.includes(listener));
  if (!handler) throw new Error(`Agent did not register ${signal}.`);
  return handler as () => void;
}

it('drains active jobs on SIGTERM, claims nothing new, then exits cleanly', async () => {
  const before = process.listeners('SIGTERM');
  let finish: () => void = () => {};
  let cancelSignal: AbortSignal | undefined;
  executeJob.mockImplementation((_job, options) => {
    cancelSignal = options.cancelSignal;
    return new Promise((resolve) => {
      finish = () => resolve({ status: 'succeeded' });
    });
  });
  pollJobs.mockResolvedValue({ ok: true, jobs: [] }).mockResolvedValueOnce({
    ok: true,
    jobs: [{ command: ['sleep', '1'], runId: 'run-1' }],
  });
  const loop = runDevboxAgentLoop({
    baseUrl: 'https://example.test',
    token: 'fixture',
  });
  await vi.waitFor(() => expect(executeJob).toHaveBeenCalledTimes(1));
  agentHandler('SIGTERM', before)();
  const pollsAtStop = pollJobs.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(pollJobs.mock.calls.length).toBe(pollsAtStop);
  expect(cancelSignal?.aborted).toBe(false);
  finish();
  await loop;
  expect(process.stdout.write).toHaveBeenCalledWith(
    'Devbox agent stopped after draining active jobs.\n'
  );
  expect(process.listeners('SIGTERM')).toEqual(before);
});

it('cancels active jobs on a second stop signal', async () => {
  const before = process.listeners('SIGINT');
  executeJob.mockImplementation(
    (_job, options) =>
      new Promise((resolve) =>
        options.cancelSignal.addEventListener('abort', () =>
          resolve({ status: 'cancelled' })
        )
      )
  );
  pollJobs.mockResolvedValue({ ok: true, jobs: [] }).mockResolvedValueOnce({
    ok: true,
    jobs: [{ command: ['sleep', '30'], runId: 'run-1' }],
  });
  const loop = runDevboxAgentLoop({
    baseUrl: 'https://example.test',
    token: 'fixture',
  });
  await vi.waitFor(() => expect(executeJob).toHaveBeenCalledTimes(1));
  const stop = agentHandler('SIGINT', before);
  stop();
  stop();
  await loop;
  expect(process.listeners('SIGINT')).toEqual(before);
});
