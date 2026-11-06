import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveNode, runCwd, withToolDir } from './balancer-host-job';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function fixture(
  versions: string[],
  checkout: { nvmrc?: string; engines?: string }
) {
  const root = await mkdtemp(join(tmpdir(), 'balancer-node-'));
  dirs.push(root);
  for (const version of versions) {
    const bin = join(root, 'home', '.nvm', 'versions', 'node', version, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'node'), `#!/bin/sh\necho ${version}\n`);
    await chmod(join(bin, 'node'), 0o755);
  }
  const source = join(root, 'src');
  await mkdir(source, { recursive: true });
  if (checkout.nvmrc)
    await writeFile(join(source, '.nvmrc'), `${checkout.nvmrc}\n`);
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify(
      checkout.engines ? { engines: { node: checkout.engines } } : {}
    )
  );
  return { source, home: join(root, 'home') };
}

describe('balancer host toolchain resolution', () => {
  it('prefers the exact .nvmrc pin', async () => {
    const { source, home } = await fixture(['v25.9.0', 'v26.12.1', 'v27.0.0'], {
      nvmrc: '26.12.1',
      engines: '>=22.13.0',
    });
    expect(resolveNode(source, home)).toMatchObject({
      version: 'v26.12.1',
      pinned: true,
    });
  });

  it('falls back to the newest installed version that meets engines.node', async () => {
    const { source, home } = await fixture(['v22.1.0', 'v25.9.0'], {
      nvmrc: '26.12.1',
      engines: '>=22.13.0',
    });
    expect(resolveNode(source, home)).toMatchObject({
      version: 'v25.9.0',
      pinned: false,
      wanted: '>=22.13.0',
    });
  });

  it('reports no toolchain instead of using an unsupported version', async () => {
    const { source, home } = await fixture(['v22.1.0'], {
      nvmrc: '99.0.0',
      engines: '>=99.0.0',
    });
    expect(resolveNode(source, home)).toMatchObject({
      path: undefined,
      wanted: '>=99.0.0',
    });
  });

  it('puts the tool directory right after the queue shims', () => {
    expect(
      withToolDir(
        '/h/.tuturuuu/resources/bin:/usr/bin:/opt/node/bin',
        '/opt/node/bin'
      )
    ).toBe('/h/.tuturuuu/resources/bin:/opt/node/bin:/usr/bin');
    expect(withToolDir('/usr/bin', '/n')).toBe('/n:/usr/bin');
  });
});

describe('balancer host run directory', () => {
  it('rejects a cwd that leaves the checkout through a symlink', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'balancer-cwd-')));
    dirs.push(root);
    const checkout = join(root, 'checkout');
    await mkdir(join(checkout, 'packages', 'sdk'), { recursive: true });
    await mkdir(join(root, 'outside', 'nested'), { recursive: true });
    // Both a symlinked final component and a symlinked parent component.
    await symlink(join(root, 'outside'), join(checkout, 'escape'));
    await symlink('../../outside', join(checkout, 'packages', 'link'));
    await symlink('sdk', join(checkout, 'packages', 'inside'));

    expect(runCwd(checkout, 'escape')).toBeUndefined();
    expect(runCwd(checkout, 'escape/nested')).toBeUndefined();
    expect(runCwd(checkout, 'packages/link/nested')).toBeUndefined();
    expect(runCwd(checkout, 'packages/missing')).toBeUndefined();
    expect(runCwd(checkout, 'packages/sdk')).toBe(
      join(checkout, 'packages', 'sdk')
    );
    expect(runCwd(checkout, 'packages/inside')).toBe(
      join(checkout, 'packages', 'sdk')
    );
    expect(runCwd(checkout, '')).toBe(checkout);
  });
});
