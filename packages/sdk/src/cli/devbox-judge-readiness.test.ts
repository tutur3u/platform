import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawn, missing } = vi.hoisted(() => ({
  spawn: vi.fn(),
  missing: { image: false },
}));
vi.mock('node:child_process', () => ({ spawn }));

import type { TuturuuuUserClient } from '../platform';
import { getJudgeReadiness } from './devbox-judge-sandbox';
import { setupDevboxRunner } from './devbox-setup-service';

function mockDocker() {
  spawn.mockImplementation((_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      kill: () => void;
    };
    child.stdout = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      if (args.includes('info'))
        child.stdout.write(
          JSON.stringify({
            Runtimes: { runsc: {} },
            CgroupDriver: 'systemd',
            NCPU: 2,
            MemTotal: 4_000_000_000,
          })
        );
      child.emit('exit', missing.image && args.includes('inspect') ? 1 : 0);
    });
    return child;
  });
}
describe('selected Judge Docker daemon', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    spawn.mockReset();
    missing.image = false;
  });
  const images = JSON.stringify({ python: `python@sha256:${'a'.repeat(64)}` });
  it('routes capacity, image inspection, binary smoke and cleanup to the selected socket', async () => {
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', '');
    mockDocker();
    expect(
      (await getJudgeReadiness(images, 'unix:///run/judge/docker.sock')).ready
    ).toBe(true);
    expect(spawn.mock.calls.length).toBe(4);
    for (const call of spawn.mock.calls)
      expect(call[1].slice(0, 2)).toEqual([
        '--host',
        'unix:///run/judge/docker.sock',
      ]);
  });
  it('does not issue a credential when the configured image is missing', async () => {
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', '');
    mockDocker();
    missing.image = true;
    const registerAgent = vi.fn();
    await expect(
      setupDevboxRunner({
        checkoutDir: '/var/lib/judge',
        options: {
          agent: true,
          client: {
            devboxes: { registerAgent },
          } as unknown as TuturuuuUserClient,
          judgeImages: images,
          dockerHost: 'unix:///run/judge/docker.sock',
          json: true,
          runCommand: vi.fn(),
        },
      })
    ).rejects.toThrow('No pinned Judge image');
    expect(registerAgent).not.toHaveBeenCalled();
  });
});
