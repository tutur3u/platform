import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultStorageThresholds } from './storage-headroom';
import {
  checkPathIdle,
  listProcessCwdsStrict,
  openFilesUnder,
  type Run,
  type RunResult,
  systemTool,
} from './storage-liveness';
import { pruneStorage } from './storage-prune';

const ok = (stdout: string): RunResult => ({
  status: 0,
  signal: null,
  stdout,
  stderr: '',
});
const self = 4242;
/** ps lists `table`; lsof answers with `lsof`. */
const fake =
  (table: string, lsof: RunResult): Run =>
  (command) =>
    command.endsWith('/ps') ? ok(table) : lsof;

describe('strict process visibility', () => {
  const table = `${self} 501\n  77 501\n   1 0\n`;
  const full = ok(`p${self}\nfcwd\nn/home\np77\nfcwd\nn/w\np1\nfcwd\nn/\n`);

  it('returns every cwd when every live process was inspected', () => {
    expect(
      listProcessCwdsStrict({ run: fake(table, full), self, alive: () => true })
    ).toEqual([
      { pid: self, cwd: '/home' },
      { pid: 77, cwd: '/w' },
      { pid: 1, cwd: '/' },
    ]);
  });

  it('parses negative uids (macOS nobody is -2) and runs tools by absolute path', () => {
    const commands: string[] = [];
    const run: Run = (command) => {
      commands.push(command);
      return command.endsWith('/ps')
        ? ok(`${self} 501\n  88 -2\n`)
        : ok(`p${self}\nfcwd\nn/home\np88\nfcwd\nn/var/empty\n`);
    };
    expect(
      listProcessCwdsStrict({ run, self, alive: () => true })
    ).toHaveLength(2);
    expect(commands.every((command) => command.startsWith('/'))).toBe(true);
    expect(systemTool('lsof', (path) => path === '/usr/bin/lsof')).toBe(
      '/usr/bin/lsof'
    );
    // No tool found: an absolute path that fails to spawn, never PATH.
    expect(systemTool('ps', () => false)).toBe('/bin/ps');
  });

  it('rejects partial output that lists only this process', () => {
    expect(() =>
      listProcessCwdsStrict({
        run: fake(table, ok(`p${self}\nfcwd\nn/home\n`)),
        self,
        euid: 1000,
        alive: () => true,
      })
    ).toThrow(/2 live process\(es\) of uid 0, 501 could not be inspected/u);
  });

  it('treats foreign or root processes it cannot inspect as not proven absent', () => {
    // A non-root lsof exits 0 and says nothing about root's processes.
    const own = ok(`p${self}\nfcwd\nn/home\np77\nfcwd\nn/w\n`);
    expect(() =>
      listProcessCwdsStrict({ run: fake(table, own), self, alive: () => true })
    ).toThrow(/uid 0 could not be inspected/u);
    // A process that exited between ps and lsof is not a gap.
    expect(
      listProcessCwdsStrict({
        run: fake(table, own),
        self,
        alive: (pid) => pid !== 1,
      })
    ).toHaveLength(2);
  });

  it('rejects permission-denied diagnostics, empty output with exit 1, and failed runs', () => {
    const denied: RunResult = {
      ...full,
      stderr: 'lsof: WARNING: can not stat /Users/other: Permission denied\n',
    };
    for (const lsof of [
      denied,
      { status: 1, signal: null, stdout: '', stderr: '' },
      { status: null, signal: 'SIGKILL', stdout: '', stderr: '' },
      { ...full, error: new Error('ENOENT') },
    ])
      expect(() =>
        listProcessCwdsStrict({ run: fake(table, lsof), self })
      ).toThrow();
    expect(() =>
      listProcessCwdsStrict({
        run: (command) =>
          command.endsWith('/ps')
            ? { status: 1, signal: null, stdout: '', stderr: 'denied' }
            : full,
        self,
      })
    ).toThrow(/process table/u);
  });
});

describe('open files under a path', () => {
  const children: ChildProcess[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
  });

  it('parses lsof strictly: open beats exit status, diagnostics are errors', () => {
    const run =
      (result: Partial<RunResult>): Run =>
      () => ({ status: 1, signal: null, stdout: '', stderr: '', ...result });
    // lsof +D exits 1 even when it found an open file.
    expect(
      openFilesUnder('/x', { run: run({ stdout: 'p9\nf3\n' }), self })
    ).toBe('open');
    expect(openFilesUnder('/x', { run: run({}), self })).toBe('none');
    expect(
      openFilesUnder('/x', {
        run: run({ stderr: 'lsof: WARNING: Permission denied' }),
        self,
      })
    ).toBe('error');
    expect(openFilesUnder('/x', { run: run({ status: 0 }), self })).toBe(
      'error'
    );
    expect(
      openFilesUnder('/x', {
        run: run({ stdout: `p${self}\nf1\n`, status: 0 }),
        self,
      })
    ).toBe('none');
    expect(
      openFilesUnder('/x', { run: run({ stdout: 'garbage\n' }), self })
    ).toBe('error');
  });

  it('finds a real file held open by another process', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'ttr-open-')));
    dirs.push(dir);
    await mkdir(join(dir, 'cache'));
    await writeFile(join(dir, 'cache', 'blob'), 'x');
    const holder = spawn('sh', ['-c', `exec sleep 30 < "${dir}/cache/blob"`], {
      stdio: 'ignore',
    });
    children.push(holder);
    let state = openFilesUnder(join(dir, 'cache'));
    for (let attempt = 0; state !== 'open' && attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      state = openFilesUnder(join(dir, 'cache'));
    }
    expect(state).toBe('open');
    // Manual prune: the open file skips the step and nothing is removed.
    const removed: string[] = [];
    const result = pruneStorage({
      report: {
        version: 1,
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        method: 'allocated-dedup',
        thresholds: defaultStorageThresholds,
        volumes: [],
        items: [
          {
            category: 'tmp-old',
            label: 'idle',
            path: dir,
            uniqueBytes: 64 * 1024 ** 2,
            allocatedBytes: 0,
            files: 1,
            truncated: false,
            risk: 'moderate',
          },
        ],
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
      cwds: () => [],
      openFiles: (path) => openFilesUnder(path),
      prs: () => null,
      removeTree: (identity) => {
        removed.push(identity.target);
      },
    });
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      reason: `a process has files open under ${dir}`,
    });
    expect(removed).toEqual([]);
    expect(
      checkPathIdle([join(dir, 'cache')], {
        cwds: () => [],
        openFiles: (path) => openFilesUnder(path),
      })
    ).toEqual({
      ok: false,
      reason: `a process has files open under ${join(dir, 'cache')}`,
    });
  });
});
