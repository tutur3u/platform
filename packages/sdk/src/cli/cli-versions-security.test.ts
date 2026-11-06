import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateRelease,
  installRelease,
  verifyInstalled,
} from './cli-versions';
import { realExecutable } from './resources-command';

type Member = {
  name: string;
  type?: string;
  link?: string;
  content?: string;
  prefix?: string;
};
const bun = realExecutable('bun', '/nonexistent');
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function temporary() {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), 'ttr-cli-security-'))
  );
  dirs.push(dir);
  return dir;
}

function archive(members: Member[]) {
  const chunks: Buffer[] = [];
  for (const member of members) {
    const data = Buffer.from(member.content ?? '');
    const header = Buffer.alloc(512);
    header.write(member.name, 0, 100);
    header.write('0000755\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(member.type ?? '0', 156);
    header.write(member.link ?? '', 157, 100);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(member.prefix ?? '', 345, 155);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

const packageMembers: Member[] = [
  { name: 'package/', type: '5' },
  {
    name: 'package/package.json',
    content: JSON.stringify({
      name: 'tuturuuu',
      version: '9.8.7',
      bin: { ttr: './dist/cli/index.js' },
    }),
  },
  {
    name: 'package/dist/cli/index.js',
    content: '#!/usr/bin/env bun\nconsole.log("9.8.7");\n',
  },
];

async function install(
  members = packageMembers,
  run?: Parameters<typeof installRelease>[0]['run']
) {
  const store = await temporary();
  const bytes = archive(members);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const tarball = 'https://registry.test/tuturuuu/-/tuturuuu-9.8.7.tgz';
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input) === tarball
        ? new Response(bytes)
        : Response.json({ version: '9.8.7', dist: { tarball, integrity } })
    );
  return {
    store,
    ...(await installRelease({
      spec: '9.8.7',
      store,
      registry: 'https://registry.test',
      fetchImpl,
      bun,
      run,
    })),
  };
}

async function privatePackage(path: string) {
  const pkg = join(path, 'node_modules', 'tuturuuu');
  const copy = join(path, 'private-package');
  await cp(await realpath(pkg), copy, { recursive: true });
  await rm(pkg, { recursive: true, force: true });
  await rename(copy, pkg);
  return pkg;
}

describe('archive preflight (finding 1)', () => {
  it.each([
    { name: '/absolute/escape' },
    { name: 'C:/absolute/escape' },
    { name: 'package/\\outside' },
    { name: 'package/../../escape' },
    { name: 'package/inside/../escape' },
    { name: 'other-package/escape' },
    { name: 'package/escape', prefix: '../../outside' },
    { name: 'package/escape', type: '2', link: '../../outside' },
    { name: 'package/escape', type: '1', link: '/outside' },
    { name: 'package/escape', type: '1', link: '../../outside' },
    { name: 'package/escape', type: '2', link: 'package/package.json' },
    { name: 'package/escape', type: '3' },
    { name: 'package/escape', type: '4' },
    { name: 'package/escape', type: '6' },
    { name: 'package/escape', type: '7' },
    { name: 'package/escape', type: 'g' },
    { name: 'package/escape', type: 'L', content: '../../outside' },
    { name: 'package/escape', type: 'K', content: '../../outside' },
    { name: 'package/escape', type: '5', content: 'payload' },
    { name: 'package/.bun-tag', content: 'reserved' },
    { name: 'package/escape', type: 'x', content: '25 path=../../outside\n' },
  ])(
    'rejects $name type $type before invoking any installer',
    async (member) => {
      const run = vi.fn().mockResolvedValue({ code: 0, output: '' });
      const failure = await install([...packageMembers, member], run).catch(
        (error: unknown) => error
      );
      expect(run).not.toHaveBeenCalled();
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({
        message: expect.stringMatching(/Unsafe CLI archive/u),
      });
    }
  );

  it('rejects duplicate paths and file/directory collisions before writing', async () => {
    for (const members of [
      [
        ...packageMembers,
        { name: 'package/package.json', content: 'duplicate' },
      ],
      [...packageMembers, { name: 'package/dist', content: 'not a directory' }],
    ]) {
      const run = vi.fn().mockResolvedValue({ code: 0, output: '' });
      const failure = await install(members, run).catch(
        (error: unknown) => error
      );
      expect(run).not.toHaveBeenCalled();
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({
        message: expect.stringMatching(/Unsafe CLI archive/u),
      });
    }
  });
});

describe('authenticated release tree (finding 2)', () => {
  it('materializes Bun links into private regular package files', async () => {
    const { path } = await install();
    const pkg = join(path, 'node_modules', 'tuturuuu');
    expect((await lstat(pkg)).isSymbolicLink()).toBe(false);
    expect((await lstat(join(pkg, 'dist/cli/index.js'))).nlink).toBe(1);
    expect(await verifyInstalled(path)).toMatchObject({ version: '9.8.7' });
  });

  it('detects mutations inside nested node_modules', async () => {
    const { path } = await install([
      ...packageMembers,
      { name: 'package/node_modules/bundled/data.js', content: 'original' },
    ]);
    const pkg = await privatePackage(path);
    await expect(verifyInstalled(path)).resolves.toMatchObject({
      version: '9.8.7',
    });
    await writeFile(join(pkg, 'node_modules/bundled/data.js'), 'tampered');
    await expect(verifyInstalled(path)).rejects.toThrow(/no longer matches/u);
  });

  it('rejects added symlinks and tampering through them before activation', async () => {
    const { path, store } = await install();
    const pkg = await privatePackage(path);
    const outside = join(await temporary(), 'payload.js');
    await writeFile(outside, 'original');
    await symlink(outside, join(pkg, 'injected.js'));
    await writeFile(outside, 'tampered');
    await expect(verifyInstalled(path)).rejects.toThrow(/Unsupported link/u);
    const run = vi.fn().mockResolvedValue({ code: 0, output: '' });
    await expect(
      activateRelease({ version: '9.8.7', store, run, bun })
    ).rejects.toThrow(/Unsupported link/u);
    expect(run).not.toHaveBeenCalled();
    await expect(lstat(join(store, 'current'))).rejects.toThrow();
  });

  it.each(['package', 'node_modules'])(
    'rejects an escaping %s root link',
    async (root) => {
      const { path } = await install();
      await privatePackage(path);
      const source =
        root === 'package'
          ? join(path, 'node_modules/tuturuuu')
          : join(path, 'node_modules');
      const outside = join(await temporary(), 'relocated');
      await rename(source, outside);
      await symlink(outside, source);
      await expect(verifyInstalled(path)).rejects.toThrow(/Unsupported link/u);
    }
  );

  it('rejects filesystem special entries without opening them', async () => {
    const { path } = await install();
    const pkg = await privatePackage(path);
    execFileSync('mkfifo', [join(pkg, 'pipe')]);
    await expect(verifyInstalled(path)).rejects.toThrow(
      /Unsupported link or special/u
    );
  });
});

describe('custom resource home (finding 3)', () => {
  it('hands off shims using TTR_RESOURCES_HOME and refuses activation when busy', async () => {
    const { store } = await install();
    const resources = await temporary();
    vi.stubEnv('TTR_RESOURCES_HOME', resources);
    await writeFile(
      join(resources, 'config.json'),
      JSON.stringify({ roots: ['/work/custom'] })
    );
    const run = vi.fn().mockResolvedValue({ code: 1, output: 'busy queue' });
    await expect(
      activateRelease({ version: '9.8.7', store, run, bun })
    ).rejects.toThrow(/nothing was activated/u);
    expect(run).toHaveBeenCalledWith(
      bun,
      [
        expect.any(String),
        'resources',
        'setup',
        '--root',
        '/work/custom',
        '--shell',
        'none',
        '--force',
        '--json',
      ],
      store
    );
    await expect(lstat(join(store, 'current'))).rejects.toThrow();
    run.mockResolvedValue({ code: 0, output: '' });
    await expect(
      activateRelease({ version: '9.8.7', store, run, bun })
    ).resolves.toMatchObject({ shims: true });
    expect(await readFile(join(store, 'state.json'), 'utf8')).toContain(
      '9.8.7'
    );
  });
});
