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
import { afterEach, expect, it, vi } from 'vitest';
import { collectClaude } from '../src/collectors/claude';
import { collectCodex } from '../src/collectors/codex';
import * as files from '../src/collectors/files';

vi.mock('../src/collectors/files', async (importOriginal) => {
  const actual = await importOriginal<typeof files>();
  return { ...actual, listJsonlFiles: vi.fn(actual.listJsonlFiles) };
});

const roots: string[] = [];
afterEach(async () => {
  vi.mocked(files.listJsonlFiles).mockReset();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

it.each(['codex', 'claude'] as const)(
  '%s ignores a session swapped for a symlink after enumeration',
  async (provider) => {
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
