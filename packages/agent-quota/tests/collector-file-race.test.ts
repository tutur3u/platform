import * as fs from 'node:fs/promises';
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectClaude } from '../src/collectors/claude';
import { collectCodex } from '../src/collectors/codex';
import * as files from '../src/collectors/files';

vi.mock('../src/collectors/files', async (importOriginal) => {
  const actual = await importOriginal<typeof files>();
  return { ...actual, listJsonlFiles: vi.fn(actual.listJsonlFiles) };
});

const flags = vi.hoisted(() => ({ noFollow: true }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    constants: {
      ...actual.constants,
      get O_NOFOLLOW() {
        return flags.noFollow ? actual.constants.O_NOFOLLOW : undefined;
      },
    },
  };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});
const roots: string[] = [];
afterEach(async () => {
  const actualFs = await vi.importActual<typeof fs>('node:fs/promises');
  const actualFiles = await vi.importActual<typeof files>(
    '../src/collectors/files'
  );
  vi.mocked(fs.lstat).mockReset().mockImplementation(actualFs.lstat);
  vi.mocked(files.listJsonlFiles)
    .mockReset()
    .mockImplementation(actualFiles.listJsonlFiles);
  flags.noFollow = true;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe.each([true, false])('O_NOFOLLOW available: %s', (noFollow) => {
  it.each(['codex', 'claude'] as const)(
    '%s ignores a session swapped for a symlink after enumeration',
    async (provider) => {
      flags.noFollow = noFollow;
      const root = await mkdtemp(join(tmpdir(), 'quota-session-race-'));
      roots.push(root);
      const directory = join(root, 'sessions');
      await mkdir(directory);
      const session = join(directory, 'session.jsonl');
      await writeFile(session, '{}\n');
      const outside = join(root, 'outside.jsonl');
      const timestamp = new Date().toISOString();
      await writeFile(
        outside,
        `${JSON.stringify({
          timestamp,
          type: 'rate_limit_event',
          rate_limit_info: {
            rateLimitType: 'five_hour',
            utilization: 0.74,
            resetsAt: Math.floor(Date.now() / 1000) + 600,
          },
          payload: {
            rate_limits: {
              primary: {
                used_percent: 74,
                window_minutes: 300,
                resets_at: Math.floor(Date.now() / 1000) + 600,
              },
            },
          },
        })}\n`
      );
      const actual = await vi.importActual<typeof files>(
        '../src/collectors/files'
      );
      vi.mocked(files.listJsonlFiles).mockImplementationOnce(async (path) => {
        const entries = await actual.listJsonlFiles(path);
        expect(entries).toEqual([session]);
        await rename(session, join(directory, 'original.jsonl'));
        await symlink(outside, session);
        return entries;
      });

      const result =
        provider === 'codex'
          ? await collectCodex('codex', 'fixture', [root])
          : await collectClaude('claudeAgent', 'fixture', directory);
      expect(result.windows).toEqual([]);
      expect(result.recentTokens).toBeUndefined();
    }
  );

  it('reads a regular session and its metadata through the selected policy', async () => {
    flags.noFollow = noFollow;
    const root = await mkdtemp(join(tmpdir(), 'quota-regular-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    await writeFile(path, '{}\n');
    const result = await files.readJsonlSnapshot(path, 0);
    expect(result?.content).toBe('{}\n');
    expect(result?.mtimeMs).toBeGreaterThan(0);
    expect(
      await files.readJsonlSnapshot(path, Date.now() + 60_000)
    ).toBeUndefined();
  });
});

it.each(['symlink', 'inode'] as const)(
  'rejects a %s replacement after fallback metadata inspection',
  async (kind) => {
    flags.noFollow = false;
    const root = await mkdtemp(join(tmpdir(), 'quota-inode-race-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    const target = join(root, 'outside.jsonl');
    await writeFile(path, '{}\n');
    await writeFile(target, '{"outside":true}\n');
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    let swapped = false;
    vi.mocked(fs.lstat).mockImplementationOnce(async (...args) => {
      const before = await actual.lstat(...args);
      if (kind === 'symlink') {
        await fs.unlink(path);
        await fs.symlink(target, path);
      } else {
        await fs.rename(target, path);
      }
      swapped = true;
      return before;
    });
    await expect(files.readJsonlSnapshot(path, 0)).rejects.toThrow();
    expect(swapped).toBe(true);
  }
);
