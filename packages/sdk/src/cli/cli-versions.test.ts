import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateRelease,
  installRelease,
  listReleases,
  pruneReleases,
  verifyInstalled,
} from './cli-versions';
import { realExecutable } from './resources-command';

const bun = realExecutable('bun', '/nonexistent');
const registry = 'https://registry.test';
const dirs: string[] = [];
afterEach(async () => {
  delete process.env.FAKE_TTR_LOG;
  delete process.env.FAKE_TTR_SETUP_EXIT;
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function temporary() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'ttr-cli-')));
  dirs.push(path);
  return path;
}

// A dependency-free stand-in for the published package: its CLI prints its
// version, and records (or refuses) `resources setup` like a release would.
async function release(version: string) {
  const root = await temporary();
  const pkg = join(root, 'package');
  await mkdir(join(pkg, 'dist', 'cli'), { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: 'tuturuuu',
      version,
      bin: { ttr: './dist/cli/index.js' },
    })
  );
  await writeFile(
    join(pkg, 'dist', 'cli', 'index.js'),
    `#!/usr/bin/env bun
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'resources' && args[1] === 'setup') {
  fs.appendFileSync(process.env.FAKE_TTR_LOG, JSON.stringify({ version: ${JSON.stringify(version)}, args }) + '\\n');
  process.exit(Number(process.env.FAKE_TTR_SETUP_EXIT || 0));
}
console.log(${JSON.stringify(version)});
`
  );
  execFileSync('tar', [
    '-czf',
    join(root, 'release.tgz'),
    '-C',
    root,
    'package',
  ]);
  const bytes = await readFile(join(root, 'release.tgz'));
  return {
    version,
    bytes,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}
type Release = Awaited<ReturnType<typeof release>>;
function registryFetch(
  releases: Release[],
  tamper?: (bytes: Buffer) => Buffer
) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    for (const entry of releases) {
      const tarball = `${registry}/tuturuuu/-/tuturuuu-${entry.version}.tgz`;
      if (
        url === `${registry}/tuturuuu/${entry.version}` ||
        url === `${registry}/tuturuuu/latest`
      )
        return Response.json({
          version: entry.version,
          dist: { tarball, integrity: entry.integrity },
        });
      if (url === tarball)
        return new Response(tamper ? tamper(entry.bytes) : entry.bytes);
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
const install = (
  store: string,
  releases: Release[],
  spec: string,
  tamper?: (bytes: Buffer) => Buffer
) =>
  installRelease({
    spec,
    store,
    registry,
    bun,
    fetchImpl: registryFetch(releases, tamper),
  });

describe('side-by-side CLI releases', { timeout: 60_000 }, () => {
  it('installs only integrity-verified bytes and reuses a verified install', async () => {
    const store = await temporary();
    const v1 = await release('9.9.1');
    const first = await install(store, [v1], '9.9.1');
    expect(first.reused).toBe(false);
    expect(first.release).toMatchObject({
      version: '9.9.1',
      integrity: v1.integrity,
      files: 2,
    });
    expect(await verifyInstalled(first.path)).toMatchObject({
      version: '9.9.1',
    });
    expect(
      (await readdir(join(store, 'versions'))).filter((name) =>
        name.startsWith('.staging')
      )
    ).toEqual([]);
    expect((await install(store, [v1], 'latest')).reused).toBe(true);
  });

  it('refuses a tarball that fails its registry integrity and publishes nothing', async () => {
    const store = await temporary();
    const v1 = await release('9.9.1');
    await expect(
      install(store, [v1], '9.9.1', (bytes) =>
        Buffer.concat([bytes, Buffer.from('x')])
      )
    ).rejects.toThrow(
      /failed its registry integrity check; nothing was installed/u
    );
    expect(await readdir(join(store, 'versions')).catch(() => [])).toEqual([]);
  });

  it('rejects registry metadata pointing at another supplier', async () => {
    const store = await temporary();
    const fetchImpl = (async () =>
      Response.json({
        version: '9.9.1',
        dist: {
          tarball: 'https://mirror.example/tuturuuu-9.9.1.tgz',
          integrity: 'sha512-x',
        },
      })) as unknown as typeof fetch;
    await expect(
      installRelease({ spec: '9.9.1', store, registry, bun, fetchImpl })
    ).rejects.toThrow(/not a usable release/u);
  });

  it('detects a tampered install and never overwrites it silently', async () => {
    const store = await temporary();
    const v1 = await release('9.9.1');
    const { path } = await install(store, [v1], '9.9.1');
    const entry = join(
      path,
      'node_modules',
      'tuturuuu',
      'dist',
      'cli',
      'index.js'
    );
    // Bun may link the package directory to its shared tarball cache.
    // Materialize a private copy before deliberately corrupting this install.
    const pkg = join(path, 'node_modules', 'tuturuuu');
    const replacement = join(path, 'tampered-package');
    await cp(await realpath(pkg), replacement, { recursive: true });
    await rm(pkg, { recursive: true, force: true });
    await rename(replacement, pkg);
    await writeFile(entry, 'evil()');
    await expect(verifyInstalled(path)).rejects.toThrow(/no longer matches/u);
    expect((await listReleases(store))[0]).toMatchObject({
      version: '9.9.1',
      verified: false,
    });
    await expect(install(store, [v1], '9.9.1')).rejects.toThrow(
      /exists but does not verify/u
    );
    const fresh = await install(await temporary(), [v1], '9.9.1');
    expect(await verifyInstalled(fresh.path)).toMatchObject({
      version: '9.9.1',
    });
  });

  it('activates through the target release setup, swaps current and launchers, and rolls back', async () => {
    const store = await temporary();
    const resources = await temporary();
    const log = join(resources, 'setup.log');
    process.env.FAKE_TTR_LOG = log;
    await writeFile(
      join(resources, 'config.json'),
      JSON.stringify({ roots: ['/work/upskii', '/work/tuturuuu'] })
    );
    const [v1, v2] = [await release('9.9.1'), await release('9.9.2')];
    await install(store, [v1, v2], '9.9.1');
    await install(store, [v1, v2], '9.9.2');
    await activateRelease({
      version: '9.9.1',
      store,
      resourcesHome: resources,
      bun,
    });
    const second = await activateRelease({
      version: '9.9.2',
      store,
      resourcesHome: resources,
      bun,
    });
    expect(second).toMatchObject({ previous: '9.9.1', shims: true });
    expect(await readlink(join(store, 'current'))).toBe(
      join('versions', '9.9.2')
    );
    expect(
      execFileSync(join(store, 'bin', 'ttr'), { encoding: 'utf8' }).trim()
    ).toBe('9.9.2');
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls.map((call) => call.version)).toEqual(['9.9.1', '9.9.2']);
    expect(calls[1].args).toEqual([
      'resources',
      'setup',
      '--root',
      '/work/upskii',
      '--shell',
      'none',
      '--force',
      '--json',
    ]);
    // Rollback is activating the previous release.
    await activateRelease({
      version: '9.9.1',
      store,
      resourcesHome: resources,
      bun,
    });
    expect(
      execFileSync(join(store, 'bin', 'ttr'), { encoding: 'utf8' }).trim()
    ).toBe('9.9.1');
  });

  it('activates nothing when the target refuses the shim handoff (busy queue)', async () => {
    const store = await temporary();
    const resources = await temporary();
    process.env.FAKE_TTR_LOG = join(resources, 'setup.log');
    await writeFile(
      join(resources, 'config.json'),
      JSON.stringify({ roots: ['/work/upskii'] })
    );
    const [v1, v2] = [await release('9.9.1'), await release('9.9.2')];
    await install(store, [v1, v2], '9.9.1');
    await install(store, [v1, v2], '9.9.2');
    await activateRelease({
      version: '9.9.1',
      store,
      resourcesHome: resources,
      bun,
    });
    process.env.FAKE_TTR_SETUP_EXIT = '1';
    await expect(
      activateRelease({
        version: '9.9.2',
        store,
        resourcesHome: resources,
        bun,
      })
    ).rejects.toThrow(/nothing was activated/u);
    expect(await readlink(join(store, 'current'))).toBe(
      join('versions', '9.9.1')
    );
    expect(
      execFileSync(join(store, 'bin', 'ttr'), { encoding: 'utf8' }).trim()
    ).toBe('9.9.1');
  });

  it('prunes old releases but never the current or previous one', async () => {
    const store = await temporary();
    const resources = await temporary();
    const releases = [
      await release('9.9.1'),
      await release('9.9.2'),
      await release('9.9.3'),
    ];
    for (const entry of releases) await install(store, releases, entry.version);
    await activateRelease({
      version: '9.9.2',
      store,
      resourcesHome: resources,
      bun,
    });
    await activateRelease({
      version: '9.9.3',
      store,
      resourcesHome: resources,
      bun,
    });
    expect(await pruneReleases({ keep: 0, store })).toEqual(['9.9.1']);
    expect((await listReleases(store)).map((entry) => entry.version)).toEqual([
      '9.9.2',
      '9.9.3',
    ]);
    await expect(pruneReleases({ keep: -1, store })).rejects.toThrow(/--keep/u);
  });
});
