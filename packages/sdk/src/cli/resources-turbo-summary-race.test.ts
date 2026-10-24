import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { reportTurboSummary } from './resources-turbo-summary';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

const roots: string[] = [];
afterEach(async () => {
  vi.mocked(fs.lstat).mockReset();
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
  return {
    root,
    path,
    content,
    plan: { root, owned: false, args: [], existing: new Set<string>() },
  };
}

it('does not follow a summary symlink', async () => {
  const { root, path, content, plan } = await fixture();
  const target = join(root, 'outside.json');
  await fs.writeFile(target, content);
  await fs.symlink(target, path);
  const lines: string[] = [];
  await reportTurboSummary(plan, (line) => lines.push(line));
  expect(lines).toEqual([]);
  expect(await fs.readFile(target, 'utf8')).toBe(content);
});

it('cannot substitute a symlink between the pathname check and read', async () => {
  const { root, path, content, plan } = await fixture();
  await fs.writeFile(path, content);
  const target = join(root, 'outside.json');
  await fs.writeFile(
    target,
    JSON.stringify({
      id: 'mine',
      tasks: [{ cache: { status: 'HIT', remote: true } }],
    })
  );
  const actual = await vi.importActual<typeof fs>('node:fs/promises');
  vi.mocked(fs.lstat).mockImplementationOnce(async () => {
    const info = await actual.lstat(path);
    await fs.unlink(path);
    await fs.symlink(target, path);
    return info;
  });
  const lines: string[] = [];
  await reportTurboSummary(plan, (line) => lines.push(line));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('(local 1, remote 0)');
  expect(await fs.readFile(target, 'utf8')).toContain('"remote":true');
});
