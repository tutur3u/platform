import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runResourcesCommand } from './resources';
import { resourceShims } from './resources-command';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import {
  installedResourceShims,
  installResourceShims,
} from './resources-setup';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: vi.fn(actual.mkdir),
    writeFile: vi.fn(actual.writeFile),
    chmod: vi.fn(actual.chmod),
    rename: vi.fn(actual.rename),
  };
});
vi.mock('./resources-diagnostics', async (original) => ({
  ...(await original<typeof import('./resources-diagnostics')>()),
  memoryPressure: async () => ({ blocked: false, reason: null }),
}));
const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  process.exitCode = 0;
  for (const home of homes.splice(0))
    await fs.rm(home, { recursive: true, force: true });
});
async function fixture() {
  const home = await fs.mkdtemp(join(tmpdir(), 'resource-provisioning-'));
  homes.push(home);
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  vi.stubEnv('TTR_RESOURCES_BYPASS', '');
  await atomicJson(join(home, 'config.json'), {
    ...defaultResourceConfig(),
    validationLanes: 1,
  });
  await installResourceShims(home);
  vi.clearAllMocks();
  return home;
}
function expectNoShimWrites(home: string) {
  for (const operation of [fs.mkdir, fs.writeFile, fs.chmod, fs.rename]) {
    expect(
      vi
        .mocked(operation)
        .mock.calls.filter((args) =>
          args.some((arg) => String(arg).startsWith(join(home, 'bin')))
        )
    ).toEqual([]);
  }
}
it('reuses valid shims, admits before the child marker, and drains without shim writes', async () => {
  const home = await fixture();
  const marker = join(home, 'marker');
  await runResourcesCommand([
    'run',
    '--',
    process.execPath,
    '-e',
    `const fs=require('node:fs');const home=${JSON.stringify(home)};const owners=['lock','slots/0','slots/1'].map(n=>home+'/'+n+'/owner.json');if(!owners.some(p=>fs.existsSync(p)&&JSON.parse(fs.readFileSync(p)).childPid))process.exit(22);fs.writeFileSync(${JSON.stringify(marker)},'admitted');`,
  ]);
  expect(process.exitCode).toBe(0);
  expect(await fs.readFile(marker, 'utf8')).toBe('admitted');
  expect((await resourceQueueStatus(home)).occupied).toBe(0);
  expectNoShimWrites(home);
});
it.each(['missing', 'stale', 'malformed', 'nonexecutable', 'symlink'])(
  'rejects %s shims before queue or workload, without implicit setup',
  async (kind) => {
    const home = await fixture();
    const shim = join(home, 'bin', resourceShims[0]!);
    if (kind === 'missing') await fs.rm(shim);
    if (kind === 'stale')
      await fs.writeFile(
        shim,
        (await fs.readFile(shim, 'utf8')).replace(
          'resources-entry',
          'old-resources-entry'
        )
      );
    if (kind === 'malformed')
      await fs.writeFile(shim, '# Managed by ttr resources\ninvalid');
    if (kind === 'nonexecutable') await fs.chmod(shim, 0o600);
    if (kind === 'symlink') {
      await fs.rename(shim, join(home, 'saved'));
      await fs.symlink(join(home, 'saved'), shim);
    }
    vi.clearAllMocks();
    const marker = join(home, 'marker');
    await expect(
      runResourcesCommand([
        'run',
        '--',
        process.execPath,
        '-e',
        `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`,
      ])
    ).rejects.toThrow('ttr resources setup --shell none');
    const files = await fs.readdir(home);
    for (const name of ['queue', 'lock', 'slots', 'admission', 'marker'])
      expect(files).not.toContain(name);
    expectNoShimWrites(home);
    for (const operation of [fs.mkdir, fs.writeFile, fs.chmod, fs.rename])
      expect(operation).not.toHaveBeenCalled();
  }
);
it('validates every installed shim, including the last one', async () => {
  const home = await fixture();
  await fs.rm(join(home, 'bin', resourceShims.at(-1)!));
  await expect(installedResourceShims(home)).rejects.toThrow(
    'missing, stale, or malformed'
  );
  expectNoShimWrites(home);
});

it('rejects an executable FIFO without blocking on a content read', async () => {
  const home = await fixture();
  const path = join(home, 'bin', resourceShims[0]!);
  await fs.rm(path);
  execFileSync('/usr/bin/mkfifo', [path]);
  await fs.chmod(path, 0o700);
  vi.clearAllMocks();
  await expect(installedResourceShims(home)).rejects.toThrow(
    'missing, stale, or malformed'
  );
  expectNoShimWrites(home);
});

it('cold caller must explicitly setup before admission, and later run never provisions', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'resource-cold-start-'));
  homes.push(home);
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  vi.stubEnv('TTR_RESOURCES_BYPASS', '');
  const marker = join(home, 'marker');
  const command = [
    'run',
    '--',
    process.execPath,
    '-e',
    `const fs=require('node:fs');const owner=JSON.parse(fs.readFileSync(${JSON.stringify(join(home, 'slots/0/owner.json'))}));if(!owner.childPid)process.exit(22);fs.writeFileSync(${JSON.stringify(marker)},'admitted');`,
  ];
  vi.clearAllMocks();
  await expect(runResourcesCommand(command)).rejects.toThrow(
    'ttr resources setup --shell none'
  );
  expect(await fs.readdir(home)).toEqual([]);
  for (const operation of [fs.mkdir, fs.writeFile, fs.chmod, fs.rename])
    expect(operation).not.toHaveBeenCalled();
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  try {
    await runResourcesCommand(['setup', '--root', home, '--shell', 'none']);
  } finally {
    output.mockRestore();
  }
  await expect(installedResourceShims(home)).resolves.toBe(join(home, 'bin'));
  expect(
    JSON.parse(await fs.readFile(join(home, 'config.json'), 'utf8')).enabled
  ).toBe(true);
  vi.clearAllMocks();
  await runResourcesCommand(command);
  expect(process.exitCode).toBe(0);
  expect(await fs.readFile(marker, 'utf8')).toBe('admitted');
  expect((await resourceQueueStatus(home)).occupied).toBe(0);
  expectNoShimWrites(home);
}, 30_000);

it('refuses a different installation before replacing any launcher', async () => {
  const home = await fixture();
  const before = await Promise.all(
    resourceShims.map((name) => fs.readFile(join(home, 'bin', name), 'utf8'))
  );
  const foreign = join(
    home,
    'stale-workspace',
    'packages/sdk/dist/cli/resources-entry.js'
  );
  await expect(installResourceShims(home, foreign)).rejects.toThrow(
    'cross-install'
  );
  expect(
    await Promise.all(
      resourceShims.map((name) => fs.readFile(join(home, 'bin', name), 'utf8'))
    )
  ).toEqual(before);
  expectNoShimWrites(home);
});

it('an admitted shim runs without installing or replacing launchers', async () => {
  const home = await fixture();
  const config = defaultResourceConfig();
  config.roots = [process.cwd()];
  await atomicJson(join(home, 'config.json'), config);
  const marker = join(home, 'shim-marker');
  await runResourcesCommand([
    'shim',
    'node',
    '--',
    '-e',
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')`,
  ]);
  expect(process.exitCode).toBe(0);
  expect(await fs.readFile(marker, 'utf8')).toBe('ran');
  expectNoShimWrites(home);
});
