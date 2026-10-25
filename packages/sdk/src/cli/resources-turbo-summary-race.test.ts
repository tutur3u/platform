import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportTurboSummary } from './resources-turbo-summary';

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
  return {
    ...actual,
    lstat: vi.fn(actual.lstat),
    readdir: vi.fn(actual.readdir),
  };
});
const roots: string[] = [];
afterEach(async () => {
  const actual = await vi.importActual<typeof fs>('node:fs/promises');
  vi.mocked(fs.lstat).mockReset().mockImplementation(actual.lstat);
  vi.mocked(fs.readdir).mockReset().mockImplementation(actual.readdir);
  flags.noFollow = true;
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'ttr-summary-race-'));
  roots.push(root);
  const runs = join(root, '.turbo', 'runs');
  await fs.mkdir(runs, { recursive: true });
  const path = join(runs, 'mine.json');
  const content = JSON.stringify({
    id: 'mine',
    tasks: [{ cache: { status: 'HIT', local: true } }],
  });
  await fs.writeFile(path, content);
  const target = join(root, 'outside.json');
  await fs.writeFile(
    target,
    JSON.stringify({
      id: 'mine',
      tasks: [{ cache: { status: 'HIT', remote: true } }],
    })
  );
  return {
    path,
    target,
    content,
    plan: { root, owned: false, args: [], existing: new Set<string>() },
  };
}

describe.each([true, false])('O_NOFOLLOW available: %s', (noFollow) => {
  it('rejects a symlink swapped after listing and before open', async () => {
    flags.noFollow = noFollow;
    const { path, target, plan } = await fixture();
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    let swapped = false;
    vi.mocked(fs.readdir).mockImplementationOnce(async (...args) => {
      const entries = await actual.readdir(...args);
      await fs.unlink(path);
      await fs.symlink(target, path);
      swapped = true;
      return entries;
    });
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(swapped).toBe(true);
    expect(lines).toEqual([]);
    expect(await fs.readFile(target, 'utf8')).toContain('"remote":true');
  });

  it('preserves regular-file reporting and owned cleanup', async () => {
    flags.noFollow = noFollow;
    const { path, plan } = await fixture();
    plan.owned = true;
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('(local 1, remote 0)');
    await expect(fs.access(path)).rejects.toThrow();
  });

  it('rejects a symlink already present without deleting its referent', async () => {
    flags.noFollow = noFollow;
    const { path, target, plan } = await fixture();
    await fs.unlink(path);
    await fs.symlink(target, path);
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toEqual([]);
    expect(await fs.readFile(target, 'utf8')).toContain('"remote":true');
  });
});

it.each(['symlink', 'inode'] as const)(
  'rejects a %s replacement between fallback open and identity check',
  async (kind) => {
    flags.noFollow = false;
    const { path, target, plan } = await fixture();
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    let swapped = false;
    vi.mocked(fs.lstat).mockImplementationOnce(async (...args) => {
      if (kind === 'symlink') {
        await fs.unlink(path);
        await fs.symlink(target, path);
      } else {
        await fs.rename(target, path);
      }
      swapped = true;
      return actual.lstat(...args);
    });
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(swapped).toBe(true);
    expect(lines).toEqual([]);
  }
);
