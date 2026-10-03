import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, afterEach, expect, it } from 'vitest';
import {
  PLAYGROUND_EXPORT_BYTES,
  PLAYGROUND_EXPORT_SCRIPT,
} from './devbox-playground-files';
import { runPlaygroundJob } from './devbox-playground-sandbox';
import { sandboxDocker } from './devbox-sandbox-process';

// Opt-in, real Docker/runsc acceptance. Never included in the ordinary unit suite.
if (process.env.TTR_PLAYGROUND_ACCEPTANCE !== 'true')
  throw new Error('Disposable CI acceptance must be explicitly enabled');
const pool = process.env.TUTURUUU_PLAYGROUND_POOL_ID;
if (!pool || !/^ci-[0-9]+-[0-9]+$/.test(pool))
  throw new Error('Acceptance requires an isolated CI pool identity');
const projects = [randomUUID(), randomUUID(), randomUUID()];
const limits = {
  max_cpu_percent: 50,
  max_memory_percent: 25,
  max_sandboxes: 1,
  max_instances: 1,
  sandbox_memory_mb: 256,
  sandbox_timeout_seconds: 5,
  sandbox_pids: 32,
};
const encode = (projectId: string, extra: Record<string, unknown>) =>
  Buffer.from(
    JSON.stringify({ projectId, revision: 1, language: 'python', ...extra })
  ).toString('base64url');
const run = (
  projectId: string,
  command: string,
  files: { path: string; content: string }[] = []
) =>
  runPlaygroundJob(
    encode(projectId, { operation: 'run', files, command }),
    limits
  );

async function ownedContainers() {
  const result = await sandboxDocker([
    'ps',
    '-aq',
    '--filter',
    `label=ttr.pool=${pool}`,
  ]);
  expect(result.code).toBe(0);
  return result.output.trim().split('\n').filter(Boolean);
}
async function diagnoseSyntheticExport(error: unknown) {
  if (
    !(error instanceof Error) ||
    error.message !== 'Could not export project files'
  )
    return;
  // Only this opt-in CI fixture's disposable containers are inspected. Never log
  // exported file content or alter the production error redaction policy.
  for (const id of await ownedContainers()) {
    if (!/^[a-f0-9]{12,64}$/.test(id))
      throw new Error('Invalid owned container ID');
    // Inspect only the disposable synthetic fixture's resource/status fields.
    // Never dump container configuration, environment variables or file content.
    const inspected = await sandboxDocker(['inspect', id]);
    if (inspected.code === 0 && !inspected.exceeded && !inspected.timedOut) {
      const [container] = JSON.parse(inspected.output);
      console.error(
        'Synthetic acceptance container diagnostic',
        JSON.stringify({
          running: container.State?.Running,
          exitCode: container.State?.ExitCode,
          oomKilled: container.State?.OOMKilled,
          memoryBytes: container.HostConfig?.Memory,
          memorySwapBytes: container.HostConfig?.MemorySwap,
          pidsLimit: container.HostConfig?.PidsLimit,
          cpuQuota: container.HostConfig?.NanoCpus,
          runtime: container.HostConfig?.Runtime,
        })
      );
    }
    const exported = await sandboxDocker(
      ['exec', id, 'python3', '-I', '-S', '-B', '-c', PLAYGROUND_EXPORT_SCRIPT],
      '',
      15_000,
      PLAYGROUND_EXPORT_BYTES
    );
    console.error(
      'Synthetic acceptance export diagnostic',
      JSON.stringify({
        code: exported.code,
        timedOut: exported.timedOut,
        exceeded: exported.exceeded,
        outputBytes: Buffer.byteLength(exported.output),
        // JSON escaping prevents terminal control sequences; cap the fixture-only
        // stderr and strip ANSI sequences before printing it.
        stderr: stripVTControlCharacters(exported.stderr).slice(0, 2048),
      })
    );
  }
}
afterEach(async () => {
  const stopped = await Promise.allSettled(
    projects.map((projectId) =>
      runPlaygroundJob(encode(projectId, { operation: 'stop' }), limits)
    )
  );
  expect(stopped.every((result) => result.status === 'fulfilled')).toBe(true);
  expect(await ownedContainers()).toEqual([]);
});
afterAll(async () => {
  for (const id of await ownedContainers()) {
    if (!/^[a-f0-9]{12,64}$/.test(id))
      throw new Error('Invalid owned container ID');
    const removed = await sandboxDocker(['rm', '--force', id]);
    expect(removed.code).toBe(0);
  }
  expect(await ownedContainers()).toEqual([]);
});

it('runs the actual SDK, checkpoints only safe text, and retains an isolated warm preview', async () => {
  const changes: {
    files: { path: string; content: string }[];
    paths: string[];
  }[] = [];
  const result = await runPlaygroundJob(
    encode(projects[0]!, {
      operation: 'run',
      files: [{ path: 'index.html', content: 'initial' }],
      command: `python3 - <<'PY'
import os, socket
assert os.getuid() == 65534
assert 'TTR_HOST_CANARY' not in os.environ
assert not os.path.exists('/var/run/docker.sock')
try:
    open('/etc/escape', 'w').write('blocked')
    raise AssertionError('root filesystem was writable')
except OSError: pass
try:
    socket.create_connection(('1.1.1.1', 53), timeout=0.3)
    raise AssertionError('external network was reachable')
except OSError: pass
open('index.html', 'w').write('synthetic preview')
open('unicode.txt', 'w').write('λ🙂')
open('binary.bin', 'wb').write(b'\\x00\\xff')
os.symlink('/etc/passwd', 'outside.txt')
print('isolated')
PY
python3 -m http.server 8080 --bind 127.0.0.1 </dev/null >/tmp/preview.log 2>&1 &
python3 - <<'PY'
import time, urllib.request
for attempt in range(20):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8080/index.html', timeout=0.2) as response:
            assert response.status == 200
        break
    except OSError:
        time.sleep(0.1)
else: raise AssertionError('loopback preview did not start')
PY`,
    }),
    limits,
    async (delta) => {
      changes.push(delta);
    }
  ).catch(async (error: unknown) => {
    await diagnoseSyntheticExport(error).catch(() => {
      console.error('Synthetic acceptance export diagnostic unavailable');
    });
    throw error;
  });
  expect(result.code).toBe(0);
  expect(result.output).toContain('isolated');
  expect(changes).toHaveLength(1);
  expect(changes[0]?.files).toEqual([
    { path: 'index.html', content: 'synthetic preview' },
    { path: 'unicode.txt', content: 'λ🙂' },
  ]);
  expect(changes[0]?.paths).toEqual(['index.html', 'unicode.txt']);
  const ids = await ownedContainers();
  expect(ids).toHaveLength(1);
  const inspected = await sandboxDocker(['inspect', ids[0]!]);
  expect(inspected.code).toBe(0);
  const [container] = JSON.parse(inspected.output);
  expect(container.HostConfig.Runtime).toBe('runsc');
  expect(container.Config.User).toBe('65534:65534');
  expect(container.HostConfig.ReadonlyRootfs).toBe(true);
  expect(container.HostConfig.NetworkMode).toBe('none');
  expect(container.HostConfig.Privileged).toBe(false);
  expect(container.HostConfig.Binds ?? []).toEqual([]);
  for (const mount of container.Mounts) expect(mount.Type).toBe('tmpfs');
  expect(container.HostConfig.PidsLimit).toBe(32);
  expect(container.HostConfig.Memory).toBeLessThanOrEqual(256 * 1024 * 1024);
  expect(container.HostConfig.Memory).toBeGreaterThanOrEqual(128 * 1024 * 1024);
  expect(container.HostConfig.NanoCpus).toBeGreaterThan(0);
  expect(container.HostConfig.NanoCpus).toBeLessThanOrEqual(1e9);
  const preview = await runPlaygroundJob(
    encode(projects[0]!, {
      operation: 'preview',
      port: 8080,
      path: '/index.html',
    }),
    limits
  );
  const body = JSON.parse(preview.preview!);
  expect(body.status).toBe(200);
  expect(Buffer.from(body.body, 'base64').toString()).toBe('synthetic preview');
  await expect(run(projects[1]!, 'true')).rejects.toThrow('capacity');
  await runPlaygroundJob(encode(projects[0]!, { operation: 'stop' }), limits);
  expect(await ownedContainers()).toEqual([]);
}, 120_000);

it('rejects traversal before allocation and removes the process tree after output or time limits', async () => {
  await expect(
    run(projects[1]!, 'true', [{ path: '../escape', content: 'blocked' }])
  ).rejects.toThrow();
  expect(await ownedContainers()).toEqual([]);
  await expect(
    run(projects[1]!, `python3 -c "print('x' * 100000)"`)
  ).rejects.toThrow('output limit');
  expect(await ownedContainers()).toEqual([]);
  await expect(
    runPlaygroundJob(
      encode(projects[2]!, {
        operation: 'run',
        files: [],
        command: 'sleep 30 & wait',
      }),
      { ...limits, sandbox_timeout_seconds: 1 }
    )
  ).rejects.toThrow('time limit');
  expect(await ownedContainers()).toEqual([]);
}, 120_000);
