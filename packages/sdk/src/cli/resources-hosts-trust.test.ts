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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { runHostsAction } from './resources-hosts-cli';
import {
  proposedHostRegistry,
  readHostRegistry,
} from './resources-hosts-config';
import { hostsRun } from './resources-hosts-dispatch';
import { UntrustedRegistryError } from './resources-hosts-trust';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs) await chmod(dir, 0o700).catch(() => {});
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
const registryText = `${JSON.stringify(proposedHostRegistry())}\n`;
// A private 0700 resources home with a 0600 hosts.json, as setup creates.
async function privateHome() {
  const base = await realpath(
    await mkdtemp(join(tmpdir(), 'ttr-hosts-trust-'))
  );
  dirs.push(base);
  const home = join(base, 'resources');
  await mkdir(home, { mode: 0o700 });
  await writeFile(join(home, 'hosts.json'), registryText, { mode: 0o600 });
  return { base, home };
}
const read = (home: string, canonicalHome = home, uid?: number) =>
  readHostRegistry(home, { canonicalHome, uid });

describe('hosts.json trust (REV-6503-1)', () => {
  it('accepts a private registry in the canonical home', async () => {
    const { home } = await privateHome();
    expect((await read(home))?.hosts.map((host) => host.id)).toEqual([
      'm4',
      'skr-linux-lan',
    ]);
  });

  it('treats a missing registry as not configured', async () => {
    const { home } = await privateHome();
    await rm(join(home, 'hosts.json'));
    expect(await read(home)).toBeUndefined();
  });

  it('rejects a symlinked hosts.json, home or parent', async () => {
    const { base, home } = await privateHome();
    const elsewhere = join(base, 'elsewhere.json');
    await writeFile(elsewhere, registryText, { mode: 0o600 });
    await rm(join(home, 'hosts.json'));
    await symlink(elsewhere, join(home, 'hosts.json'));
    await expect(read(home)).rejects.toThrow(/not a symlink/u);

    const linkedHome = join(base, 'linked-home');
    await rm(join(home, 'hosts.json'));
    await writeFile(join(home, 'hosts.json'), registryText, { mode: 0o600 });
    await symlink(home, linkedHome);
    await expect(read(linkedHome)).rejects.toBeInstanceOf(
      UntrustedRegistryError
    );

    const linkedParent = join(base, 'linked-parent');
    await symlink(base, linkedParent);
    await expect(read(join(linkedParent, 'resources'))).rejects.toThrow(
      /parent of the resources home is a symlink/u
    );
  });

  it.each([
    ['home group-writable', 'home', 0o770, /0700 directory/u],
    ['home world-readable', 'home', 0o755, /0700 directory/u],
    ['file world-writable', 'file', 0o666, /0600 file/u],
    ['file group-readable', 'file', 0o640, /0600 file/u],
    ['parent world-writable', 'parent', 0o777, /group- or world-writable/u],
  ] as const)('rejects a %s registry', async (_, target, mode, message) => {
    const { base, home } = await privateHome();
    const path =
      target === 'home'
        ? home
        : target === 'file'
          ? join(home, 'hosts.json')
          : base;
    await chmod(path, mode);
    await expect(read(home)).rejects.toThrow(message);
  });

  it('refuses a home inside an opted-in repository root', async () => {
    const { base, home } = await privateHome();
    await atomicJson(join(home, 'config.json'), {
      ...defaultResourceConfig(),
      roots: [base],
    });
    await expect(read(home)).rejects.toThrow(
      /inside an opted-in repository root/u
    );
    await atomicJson(join(home, 'config.json'), {
      ...defaultResourceConfig(),
      roots: [],
      repositories: [join(base, '.git')],
    });
    await expect(read(home)).rejects.toThrow(
      /inside an opted-in repository root/u
    );
    await atomicJson(join(home, 'config.json'), {
      ...defaultResourceConfig(),
      roots: [join(base, 'elsewhere')],
    });
    expect(await read(home)).toBeDefined();
  });

  it('rejects a registry owned by another user', async () => {
    const { home } = await privateHome();
    const other = (process.getuid?.() ?? 0) + 1;
    await expect(read(home, home, other)).rejects.toThrow(
      /owned by you|another user/u
    );
  });

  it('ignores the registry and disables --hosts for an attacker-chosen home', async () => {
    const { home: canonical } = await privateHome();
    const { home: chosen } = await privateHome();
    await expect(read(chosen, canonical)).rejects.toThrow(
      /TTR_RESOURCES_HOME is not the canonical/u
    );
    // The default canonical home is never a temporary directory.
    await expect(readHostRegistry(chosen)).rejects.toBeInstanceOf(
      UntrustedRegistryError
    );
    await expect(
      hostsRun({
        home: chosen,
        command: 'vitest',
        args: ['run'],
        jobClass: 'heavy',
        deps: {
          fleet: async () => undefined,
          commitPlan: async () => undefined,
          runLocal: async () => 0,
          runRemote: async () => 0,
          log: () => {},
        },
      })
    ).rejects.toThrow(/--hosts is disabled/u);
    const out: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
      });
    try {
      await runHostsAction(chosen, []);
    } finally {
      write.mockRestore();
    }
    expect(out.join('')).toContain('hosts.json is ignored');
  });
});
