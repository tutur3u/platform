import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  commandTool,
  isHeavyCommand,
  resourceShims,
} from './resources-command';
import {
  existingLauncherIdentity,
  installResourceShims,
  shellQuote,
} from './resources-setup';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'resource-install-identity-'))
  );
  homes.push(root);
  const install = join(root, 'user/.bun/install');
  const packageAt = (version: string) =>
    join(install, `cache/links/tuturuuu@${version}/node_modules/tuturuuu`);
  const entryAt = (version: string) =>
    join(packageAt(version), 'dist/cli/resources-entry.js');
  for (const version of ['0.29.0+a', '0.30.0+b']) {
    await mkdir(join(packageAt(version), 'dist/cli'), { recursive: true });
    await writeFile(entryAt(version), '// fixture');
  }
  const modules = join(install, 'global/node_modules');
  await mkdir(modules, { recursive: true });
  await symlink(packageAt('0.29.0+a'), join(modules, 'tuturuuu'));
  const home = join(root, 'resources');
  await installResourceShims(home, entryAt('0.29.0+a'));
  const contents = () =>
    Promise.all(
      resourceShims.map((name) => readFile(join(home, 'bin', name), 'utf8'))
    );
  return {
    home,
    entryAt,
    contents,
    globalEntry: join(modules, 'tuturuuu/dist/cli/resources-entry.js'),
  };
}

it('refuses a consumer cache entry while the verified global link still points at another version', async () => {
  const f = await fixture();
  const before = await f.contents();
  await expect(
    installResourceShims(f.home, f.entryAt('0.30.0+b'))
  ).rejects.toThrow('cross-install');
  expect(await f.contents()).toEqual(before);
  await installResourceShims(f.home, f.entryAt('0.30.0+b'), { force: true });
  expect(
    (await f.contents()).every((content) => content.includes('0.30.0+b'))
  ).toBe(true);
});

it('permits the same installation to update a quoted Bun runtime path', async () => {
  const f = await fixture();
  for (const name of resourceShims) {
    const file = join(f.home, 'bin', name);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        shellQuote(process.execPath),
        shellQuote("/old user's bun")
      )
    );
  }
  await installResourceShims(f.home, f.entryAt('0.29.0+a'));
  expect(
    (await f.contents()).every(
      (content) =>
        content.includes(shellQuote(process.execPath)) &&
        !content.includes('/old user')
    )
  ).toBe(true);
});

it('preserves entry ownership when an owned install adds the protocol-3 comment', async () => {
  const f = await fixture();
  const old = (await f.contents())[0]!.replace(
    '# Resource scheduler protocol: 3\n',
    ''
  );
  const global = f.globalEntry;
  const next = old.replace(
    '# Managed by ttr resources\n',
    '# Managed by ttr resources\n# Resource scheduler protocol: 3\n'
  );
  expect(
    existingLauncherIdentity(old, f.home, global, resourceShims[0]!, next)
  ).toBe(next);
  const incoming = f.entryAt('0.30.0+b');
  const foreign = next.replace(global, incoming);
  expect(
    existingLauncherIdentity(old, f.home, incoming, resourceShims[0]!, foreign)
  ).not.toBe(foreign);
});

it('keeps the shipped CLI wrapper outside shim admission', () => {
  for (const payload of [
    ['bun', 'run', 'test'],
    ['bun', 'run', 'build'],
    ['bunx', 'vitest', 'run', '--maxWorkers=24'],
  ]) {
    const args = [
      '/global/tuturuuu/bin/ttr.cjs',
      'resources',
      'run',
      '--',
      ...payload,
    ];
    expect(commandTool('bun', args).tool).toBe('ttr');
    expect(isHeavyCommand('bun', args)).toBe(false);
  }
});
