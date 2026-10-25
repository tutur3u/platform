import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateRelease,
  installRelease,
  listReleases,
  pruneReleases,
  verifyInstalled,
} from './cli-versions';
import { realExecutable } from './resources-command';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, open: vi.fn(fs.open), writeFile: vi.fn(fs.writeFile) };
});
const bun = realExecutable('bun', '/nonexistent');
const dirs: string[] = [];
beforeEach(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(open).mockReset().mockImplementation(fs.open);
  vi.mocked(writeFile).mockReset().mockImplementation(fs.writeFile);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function temporary() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cli-review-')));
  dirs.push(root);
  return root;
}

async function fixture() {
  const store = await temporary();
  const pkg = join(store, 'package');
  await mkdir(join(pkg, 'dist/cli'), { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'tuturuuu', version: '9.7.5' })
  );
  await writeFile(join(pkg, 'dist/cli/index.js'), 'console.log("9.7.5");');
  const file = join(store, 'fixture.tgz');
  execFileSync(
    'tar',
    [
      ...(process.platform === 'darwin' ? ['--no-mac-metadata'] : []),
      '--format=ustar',
      '-czf',
      file,
      '-C',
      store,
      'package',
    ],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } }
  );
  const bytes = await readFile(file);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const tarball = 'https://registry.test/tuturuuu/-/tuturuuu-9.7.5.tgz';
  const metadata = () =>
    Response.json({ version: '9.7.5', dist: { tarball, integrity } });
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url) === tarball ? new Response(bytes) : metadata()
    );
  return { store, bytes, tarball, metadata, fetchImpl };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const install = (
  f: Fixture,
  options: Partial<Parameters<typeof installRelease>[0]> = {}
) =>
  installRelease({
    spec: '9.7.5',
    store: f.store,
    registry: 'https://registry.test',
    fetchImpl: f.fetchImpl,
    bun,
    ...options,
  });
const fakeInstall = vi.fn(
  async (_command: string, _args: string[], cwd: string) => {
    await mkdir(join(cwd, 'node_modules'), { recursive: true });
    await cp(join(cwd, 'verify/package'), join(cwd, 'node_modules/tuturuuu'), {
      recursive: true,
    });
    return { code: 0, output: '' };
  }
);

describe('review fixes: Bun runtime', () => {
  it('resolves Bun under Node for installation', async () => {
    const f = await fixture();
    fakeInstall.mockClear();
    await install(f, { bun: undefined, run: fakeInstall });
    expect(fakeInstall.mock.calls[0]?.[0]).toBe(bun);
  });

  it('resolves Bun under Node for activation and launchers', async () => {
    const f = await fixture();
    await install(f);
    const resourcesHome = await temporary();
    await writeFile(
      join(resourcesHome, 'config.json'),
      JSON.stringify({ roots: ['/work/runtime'] })
    );
    const run = vi.fn().mockResolvedValue({ code: 0, output: '' });
    await activateRelease({
      version: '9.7.5',
      store: f.store,
      resourcesHome,
      run,
    });
    expect(run.mock.calls[0]?.[0]).toBe(bun);
    expect(await readFile(join(f.store, 'bin/ttr'), 'utf8')).toContain(bun);
  });

  it('fails clearly without Bun on PATH under Node', async () => {
    const f = await fixture();
    vi.stubEnv('PATH', '');
    fakeInstall.mockClear();
    await expect(
      install(f, { bun: undefined, run: fakeInstall })
    ).rejects.toThrow(/Bun.*required|Cannot find Bun/u);
    expect(fakeInstall).not.toHaveBeenCalled();
  });
});

describe('review fixes: bounded in-memory download', () => {
  it.each(['metadata', 'fetch', 'body'])(
    'times out a stalled %s and releases the install lock',
    async (phase) => {
      const f = await fixture();
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let cancelled = false;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) => {
          if (phase === 'metadata')
            return new Promise<Response>((_resolve, reject) => {
              watchdog = setTimeout(
                () => reject(new Error('test metadata watchdog')),
                150
              );
            });
          if (String(url) !== f.tarball) return f.metadata();
          if (phase === 'fetch')
            return new Promise<Response>((_resolve, reject) => {
              watchdog = setTimeout(
                () => reject(new Error('test transport watchdog')),
                150
              );
            });
          return new Response(
            new ReadableStream({
              start(controller) {
                watchdog = setTimeout(
                  () => controller.error(new Error('test body watchdog')),
                  150
                );
              },
              cancel() {
                cancelled = true;
                clearTimeout(watchdog);
              },
            })
          );
        });
      try {
        await expect(
          install(f, { fetchImpl, downloadTimeoutMs: 20 })
        ).rejects.toMatchObject({ name: 'TimeoutError' });
        await expect(
          lstat(join(f.store, 'install.lock'))
        ).rejects.toMatchObject({ code: 'ENOENT' });
        if (phase === 'body') expect(cancelled).toBe(true);
        expect(await install(f)).toMatchObject({ reused: false });
      } finally {
        clearTimeout(watchdog);
      }
    }
  );

  it('keeps no downloaded tarball in a new release directory', async () => {
    const f = await fixture();
    const first = await install(f);
    expect(
      (await readdir(first.path)).filter((name) => name.endsWith('.tgz'))
    ).toEqual([]);
    const legacy = join(first.path, 'tuturuuu-9.7.5.tgz');
    await writeFile(legacy, f.bytes);
    expect(await install(f)).toMatchObject({ reused: true });
    await expect(lstat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('review fixes: state and directory identity', () => {
  it('binds recorded version to the release directory name', async () => {
    const f = await fixture();
    const release = await install(f);
    const renamed = join(f.store, 'versions/9.7.6');
    await rename(release.path, renamed);
    await expect(verifyInstalled(renamed)).rejects.toThrow(
      /version.*directory/u
    );
    expect(await listReleases(f.store)).toEqual([
      { version: '9.7.6', verified: false, current: false, previous: false },
    ]);
  });

  it('never prunes the current release through copied metadata in another directory', async () => {
    const f = await fixture();
    const release = await install(f);
    await activateRelease({
      version: '9.7.5',
      store: f.store,
      bun,
      resourcesHome: await temporary(),
    });
    await cp(release.path, join(f.store, 'versions/9.7.6'), {
      recursive: true,
    });
    await pruneReleases({ store: f.store, keep: 0 });
    await expect(verifyInstalled(release.path)).resolves.toMatchObject({
      version: '9.7.5',
    });
  });

  it.each(['{"current":', '{"previous":42}', 'null'])(
    'reports invalid activation state clearly: %s',
    async (contents) => {
      const f = await fixture();
      await install(f);
      await writeFile(join(f.store, 'state.json'), contents);
      await expect(listReleases(f.store)).rejects.toThrow(
        /CLI activation state.*invalid/u
      );
      await expect(
        activateRelease({
          version: '9.7.5',
          store: f.store,
          bun,
          resourcesHome: await temporary(),
        })
      ).rejects.toThrow(/CLI activation state.*invalid/u);
      await expect(lstat(join(f.store, 'current'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  );

  it('fsyncs an exclusive state temp file before replacing the old state', async () => {
    const f = await fixture();
    await install(f);
    const resourcesHome = await temporary();
    await activateRelease({
      version: '9.7.5',
      store: f.store,
      bun,
      resourcesHome,
    });
    const statePath = join(f.store, 'state.json');
    const previous = await readFile(statePath, 'utf8');
    const fs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises'
      );
    let synced = false;
    vi.mocked(open).mockImplementation(async (...args) => {
      const file = await fs.open(...args);
      if (basename(String(args[0])).startsWith('.state-')) {
        expect(args[1]).toBe('wx');
        expect(args[2]).toBe(0o600);
        const sync = file.sync.bind(file);
        vi.spyOn(file, 'sync').mockImplementationOnce(async () => {
          expect(await fs.readFile(statePath, 'utf8')).toBe(previous);
          synced = true;
          await sync();
        });
      }
      return file;
    });
    await activateRelease({
      version: '9.7.5',
      store: f.store,
      bun,
      resourcesHome,
    });
    expect(synced).toBe(true);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({
      current: '9.7.5',
    });
    expect(
      (await readdir(f.store)).filter((name) => name.startsWith('.state-'))
    ).toEqual([]);
  });

  it('preserves valid state if writing or syncing the new state fails', async () => {
    const f = await fixture();
    await install(f);
    const resourcesHome = await temporary();
    await activateRelease({
      version: '9.7.5',
      store: f.store,
      bun,
      resourcesHome,
    });
    const statePath = join(f.store, 'state.json');
    const previous = await readFile(statePath, 'utf8');
    const fs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises'
      );
    vi.mocked(writeFile).mockImplementation(async (...args) => {
      if (String(args[0]) === statePath) {
        await fs.writeFile(statePath, '{"current":');
        throw new Error('simulated state write failure');
      }
      return fs.writeFile(...args);
    });
    vi.mocked(open).mockImplementation(async (...args) => {
      const file = await fs.open(...args);
      if (basename(String(args[0])).startsWith('.state-'))
        vi.spyOn(file, 'sync').mockRejectedValueOnce(
          new Error('simulated state sync failure')
        );
      return file;
    });
    await expect(
      activateRelease({ version: '9.7.5', store: f.store, bun, resourcesHome })
    ).rejects.toThrow(/simulated state/u);
    expect(await readFile(statePath, 'utf8')).toBe(previous);
    expect(
      (await readdir(f.store)).filter((name) => name.startsWith('.state-'))
    ).toEqual([]);
  });
});
