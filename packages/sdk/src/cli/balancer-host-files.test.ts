import * as fs from 'node:fs';
import type * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openLog, readLogTail, writeJson } from './balancer-host-common';
import { readBalancerRegistry } from './balancer-hosts';
import { fixtureHost } from './balancer-test-fixtures';

const hooks = vi.hoisted(() => ({
  paths: new Map<number, string>(),
  checked: undefined as ((path: string) => void) | undefined,
  synced: undefined as (() => void) | undefined,
  pathChecks: 0,
}));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      const fd = actual.openSync(...args);
      hooks.paths.set(fd, String(args[0]));
      return fd;
    },
    fstatSync: (fd: number) => {
      const info = actual.fstatSync(fd);
      hooks.checked?.(hooks.paths.get(fd) ?? '');
      return info;
    },
    fsyncSync: (fd: number) => {
      actual.fsyncSync(fd);
      hooks.synced?.();
    },
  };
});
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    lstat: (...args: Parameters<typeof fsp.lstat>) => {
      hooks.pathChecks++;
      return actual.lstat(...args);
    },
    open: async (...args: Parameters<typeof fsp.open>) => {
      const handle = await actual.open(...args);
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'stat')
            return async () => {
              const info = await target.stat();
              hooks.checked?.(String(args[0]));
              return info;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'balancer-file-race-'));
  hooks.paths.clear();
  hooks.checked = undefined;
  hooks.synced = undefined;
  hooks.pathChecks = 0;
});
afterEach(() => {
  hooks.checked = undefined;
  hooks.synced = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});
const privateFile = (name: string, value: string) => {
  const path = join(root, name);
  fs.writeFileSync(path, value, { mode: 0o600 });
  return path;
};
function swapAfterCheck(path: string, replacement: string) {
  hooks.checked = (checked) => {
    if (checked !== path) return;
    hooks.checked = undefined;
    fs.renameSync(path, `${path}.original`);
    fs.symlinkSync(replacement, path);
  };
}
const registry = (id: string) =>
  JSON.stringify({ version: 1, hosts: [fixtureHost(id)] });

it('validates and reads the same registry descriptor after the pathname is swapped', async () => {
  const path = privateFile('hosts.json', registry('original'));
  const replacement = privateFile('replacement.json', registry('replacement'));
  swapAfterCheck(path, replacement);
  expect((await readBalancerRegistry(root)).hosts[0]?.id).toBe('original');
  expect(hooks.pathChecks).toBe(0);
  expect(fs.readFileSync(path, 'utf8')).toBe(registry('replacement'));
});

it('refuses symlinked, public and foreign-owner registries', async () => {
  const target = privateFile('target.json', registry('original'));
  const path = join(root, 'hosts.json');
  fs.symlinkSync(target, path);
  await expect(readBalancerRegistry(root)).rejects.toThrow('regular 0600');
  fs.unlinkSync(path);
  fs.writeFileSync(path, registry('original'), { mode: 0o644 });
  await expect(readBalancerRegistry(root)).rejects.toThrow('regular 0600');
  fs.chmodSync(path, 0o600);
  await expect(
    readBalancerRegistry(root, (process.getuid?.() ?? 0) + 1)
  ).rejects.toThrow('regular 0600');
});

it('retains the missing-registry diagnostic', async () => {
  await expect(readBalancerRegistry(root)).rejects.toThrow(
    'No balancer hosts registered'
  );
});

it('reads the checked log inode even when its path is replaced with a symlink', () => {
  const path = privateFile('output.log', 'original log');
  const victim = privateFile('victim', 'private unrelated data');
  swapAfterCheck(path, victim);
  expect(readLogTail(path)).toEqual({
    exists: true,
    bytes: 12,
    tail: 'original log',
  });
});

it('appends through the checked descriptor after a log pathname swap', () => {
  const path = privateFile('output.log', 'original');
  const victim = privateFile('victim', 'untouched');
  swapAfterCheck(path, victim);
  const fd = openLog(path);
  try {
    fs.writeFileSync(fd, ' appended');
  } finally {
    fs.closeSync(fd);
  }
  expect(fs.readFileSync(`${path}.original`, 'utf8')).toBe('original appended');
  expect(fs.readFileSync(victim, 'utf8')).toBe('untouched');
});

it('refuses symlinked or public logs and retains missing-log behavior', () => {
  const victim = privateFile('victim', 'untouched');
  const path = join(root, 'output.log');
  expect(readLogTail(path)).toBeUndefined();
  fs.symlinkSync(victim, path);
  expect(() => readLogTail(path)).toThrow();
  expect(() => openLog(path)).toThrow();
  fs.unlinkSync(path);
  fs.writeFileSync(path, 'public', { mode: 0o644 });
  expect(() => readLogTail(path)).toThrow('regular private');
  expect(() => openLog(path)).toThrow('regular private');
});

it('retains the 64 KiB log tail and full byte count', () => {
  const path = privateFile('output.log', `prefix${'x'.repeat(65536)}`);
  expect(readLogTail(path)).toEqual({
    exists: true,
    bytes: 65542,
    tail: 'x'.repeat(65536),
  });
});

it('publishes complete JSON only after syncing the exclusive temporary file', () => {
  const path = privateFile('phase.json', '{"phase":"old"}\n');
  hooks.synced = () =>
    expect(fs.readFileSync(path, 'utf8')).toBe('{"phase":"old"}\n');
  writeJson(path, { phase: 'new' });
  expect(fs.readFileSync(path, 'utf8')).toBe('{"phase":"new"}\n');
  expect(fs.statSync(path).mode & 0o777).toBe(0o600);
  expect(fs.readdirSync(root)).toEqual(['phase.json']);
});

it('never overwrites or deletes a pre-existing temporary generation', () => {
  const path = privateFile('phase.json', 'original');
  const temporary = `${path}.${process.pid}.00000000-0000-4000-8000-000000000001.tmp`;
  fs.writeFileSync(temporary, 'owned by another writer', { mode: 0o600 });
  expect(() => writeJson(path, {})).toThrow();
  expect(fs.readFileSync(path, 'utf8')).toBe('original');
  expect(fs.readFileSync(temporary, 'utf8')).toBe('owned by another writer');
});

it('replaces a destination symlink without following it', () => {
  const victim = privateFile('victim', 'untouched');
  const path = join(root, 'phase.json');
  fs.symlinkSync(victim, path);
  writeJson(path, { phase: 'new' });
  expect(fs.readFileSync(victim, 'utf8')).toBe('untouched');
  expect(fs.lstatSync(path).isSymbolicLink()).toBe(false);
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toEqual({ phase: 'new' });
});

it('retains the first complete cancellation notice without a pathname precheck', () => {
  const path = join(root, 'cancel.json');
  writeJson(path, { at: 'first' }, { exclusive: true });
  writeJson(path, { at: 'second' }, { exclusive: true });
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toEqual({ at: 'first' });
  expect(fs.readdirSync(root)).toEqual(['cancel.json']);
});
