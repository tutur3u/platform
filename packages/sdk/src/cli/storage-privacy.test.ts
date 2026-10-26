import { lstatSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultStorageThresholds } from './storage-headroom';
import {
  checkPathIdle,
  type Run,
  type RunResult,
  scanProcesses,
} from './storage-liveness';
import { type PrivacyFs, privateTreeProof } from './storage-privacy';
import { pruneStorage } from './storage-prune';

const euid = process.geteuid?.() ?? 501;
const self = 4242;
const ok = (stdout: string): RunResult => ({
  status: 0,
  signal: null,
  stdout,
  stderr: '',
});
// ps: this process, another of ours, and root's launchd.
const run: Run = (command) =>
  command.endsWith('/ps')
    ? ok(`${self} 501\n  77 501\n   1 0\n`)
    : ok(`p${self}\nfcwd\nn/home\np77\nfcwd\nn/w\n`);

describe('process scan with hidden foreign processes', () => {
  it('accepts hidden other-uid processes only on macOS for a non-root user', () => {
    expect(
      scanProcesses({
        run,
        self,
        euid: 501,
        platform: 'darwin',
        alive: () => true,
      })
    ).toMatchObject({ hidden: [{ pid: 1, uid: 0 }] });
    for (const options of [
      { euid: 501, platform: 'linux' as const },
      { euid: 0, platform: 'darwin' as const },
    ])
      expect(() =>
        scanProcesses({ run, self, alive: () => true, ...options })
      ).toThrow(/process visibility incomplete/u);
  });

  it('never accepts a hidden process of the effective user', () => {
    const ownHidden: Run = (command) =>
      command.endsWith('/ps')
        ? ok(`${self} 501\n  77 501\n`)
        : ok(`p${self}\nfcwd\nn/home\n`);
    expect(() =>
      scanProcesses({
        run: ownHidden,
        self,
        euid: 501,
        platform: 'darwin',
        alive: () => true,
      })
    ).toThrow(/uid 501 could not be inspected/u);
  });
});

async function privateTree() {
  // mkdtemp creates the anchor 0700 and owned by this user.
  const anchor = await realpath(await mkdtemp(join(tmpdir(), 'ttr-private-')));
  await chmod(anchor, 0o700);
  const root = join(anchor, 'DerivedData');
  const item = join(root, 'App-abc');
  await mkdir(join(item, 'Build'), { recursive: true, mode: 0o755 });
  await writeFile(join(item, 'Build', 'blob'), 'x');
  return { anchor, root, item };
}
const fsWith = (
  overrides: Partial<PrivacyFs> = {},
  lstat: PrivacyFs['lstat'] = (path) => lstatSync(path)
): PrivacyFs => ({ lstat, hasAcl: () => false, ...overrides });
const proof = (
  item: string,
  root: string,
  options: Parameters<typeof privateTreeProof>[2] = {}
) =>
  privateTreeProof(item, root, {
    euid,
    platform: 'darwin',
    fs: fsWith(),
    ...options,
  });

describe('private-tree proof', () => {
  it('proves a tree under a 0700, ACL-free, user-owned anchor', async () => {
    const { anchor, root, item } = await privateTree();
    expect(proof(item, root)).toEqual({
      ok: true,
      anchor,
      evidence: 'private-tree',
    });
  });

  it('fails closed for ACLs, writable or foreign components, other devices, Linux and root', async () => {
    const { root, item } = await privateTree();
    const reasons = [
      proof(item, root, { fs: fsWith({ hasAcl: () => true }) }),
      proof(item, root, {
        fs: fsWith({}, (path) => {
          const info = lstatSync(path);
          return path === root
            ? Object.assign(info, { mode: info.mode | 0o020 })
            : info;
        }),
      }),
      proof(item, root, {
        fs: fsWith({}, (path) => {
          const info = lstatSync(path);
          return path === item ? Object.assign(info, { uid: euid + 1 }) : info;
        }),
      }),
      proof(item, root, {
        fs: fsWith({}, (path) => {
          const info = lstatSync(path);
          return path === item
            ? Object.assign(info, { dev: info.dev + 1 })
            : info;
        }),
      }),
      proof(item, root, {
        // Like ~/.t3 (0755) under a home with an ACL: no anchor qualifies.
        fs: fsWith({}, (path) => {
          const info = lstatSync(path);
          return Object.assign(info, { mode: (info.mode & ~0o777) | 0o755 });
        }),
      }),
      proof(item, root, {
        fs: fsWith({
          hasAcl: () => {
            throw new Error('ls failed');
          },
        }),
      }),
      proof(item, root, { platform: 'linux' }),
      proof(item, root, { euid: 0 }),
    ];
    expect(reasons.map((result) => result.ok)).toEqual(
      reasons.map(() => false)
    );
    expect(reasons.map((result) => !result.ok && result.reason)).toEqual([
      expect.stringMatching(/no directory .* mode 0700 and no ACL/u),
      expect.stringMatching(/group- or other-writable/u),
      expect.stringMatching(/owned by uid/u),
      expect.stringMatching(/another device/u),
      expect.stringMatching(/no directory .* mode 0700 and no ACL/u),
      expect.stringMatching(/private-tree proof failed: ls failed/u),
      'private-tree proof is macOS-only',
      'private-tree proof is never used when running as root',
    ]);
  });

  it('checkPathIdle records private-tree evidence and scopes lsof to this user', async () => {
    const { root, item } = await privateTree();
    const openFiles = vi.fn(() => 'none' as const);
    const hidden = { cwds: [], hidden: [{ pid: 1, uid: 0 }] };
    const result = checkPathIdle(
      [item],
      {
        cwds: () => {
          throw new Error('strict scan would fail');
        },
        scan: () => hidden,
        privacy: (path, rule) => proof(path, rule),
        openFiles,
      },
      () => root
    );
    expect(result).toEqual({
      ok: true,
      checks: ['cwd-scan', 'open-files', 'private-tree'],
    });
    expect(openFiles).toHaveBeenCalledWith(item, { userOnly: true });
    const refused = checkPathIdle(
      [item],
      {
        cwds: () => [],
        scan: () => hidden,
        privacy: () => ({ ok: false, reason: 'tree is 0755' }),
        openFiles,
      },
      () => root
    );
    expect(refused).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/is not provably private: tree is 0755/u),
    });
  });

  it('manual prune removes only items with a private-tree proof when foreign processes are hidden', async () => {
    // Top-level identified scratch dirs, as `analyze` reports tmp-old items.
    const items: string[] = [];
    for (const name of ['private', 'public']) {
      const path = await realpath(
        await mkdtemp(join(tmpdir(), `ttr-ptmp-${name}-`))
      );
      await chmod(path, 0o755);
      await writeFile(join(path, 'blob'), 'x');
      items.push(path);
    }
    const dir = items[0]!;
    const removed: string[] = [];
    const result = pruneStorage({
      report: {
        version: 1,
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        method: 'allocated-dedup',
        thresholds: defaultStorageThresholds,
        volumes: [],
        items: items.map((path) => ({
          category: 'tmp-old' as const,
          label: 'idle',
          path,
          uniqueBytes: 64 * 1024 ** 2,
          allocatedBytes: 0,
          files: 1,
          truncated: false,
          risk: 'moderate' as const,
        })),
        worktrees: [],
        nodeModules: [],
        docker: null,
        tmpOlderThanDays: 3,
        warnings: [],
      },
      apply: true,
      categories: ['tmp-old'],
      olderThanDays: 7,
      maxRemoveBytes: 1024 ** 3,
      paths: [],
      names: [],
      holds: () => [],
      cwds: () => {
        throw new Error('strict scan would fail');
      },
      scan: () => ({ cwds: [], hidden: [{ pid: 1, uid: 0 }] }),
      privacy: (path) =>
        path === items[0]
          ? { ok: true, anchor: dir, evidence: 'private-tree' }
          : { ok: false, reason: 'no 0700 anchor' },
      openFiles: () => 'none',
      prs: () => null,
      now: Date.now() + 30 * 86_400_000,
      removeTree: (identity) => {
        removed.push(identity.target);
      },
    });
    const byPath = Object.fromEntries(
      result.steps.map((step) => [step.path, step])
    );
    expect(byPath[items[1]!]).toMatchObject({
      status: 'skipped',
      reason: expect.stringMatching(/not provably private: no 0700 anchor/u),
    });
    // The fixture dir is not a tmp root on every OS; where it is, only the
    // private item may be removed.
    expect(removed).not.toContain(items[1]);
    for (const path of items) await rm(path, { recursive: true, force: true });
  });
});
