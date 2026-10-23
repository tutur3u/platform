import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeCommitRun, encodeCommitRun } from './devbox-commit-run';
import { executeDevboxAgentJob } from './devbox-runner';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim();

// origin (bare) <- author pushes; the runner checkout fetches by SHA.
async function repositories() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-commit-')));
  dirs.push(root);
  const origin = join(root, 'origin.git');
  git(root, 'init', '--bare', '--quiet', '-b', 'main', origin);
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const author = join(root, 'author');
  git(root, 'clone', '--quiet', origin, author);
  await mkdir(join(author, 'pkg'));
  await writeFile(join(author, 'pkg', 'value.txt'), 'committed\n');
  git(author, 'add', '.');
  git(author, 'commit', '--quiet', '-m', 'fixture');
  git(author, 'push', '--quiet', 'origin', 'HEAD:main');
  const runner = join(root, 'runner');
  git(root, 'clone', '--quiet', origin, runner);
  // A later commit the runner has not fetched yet.
  await writeFile(join(author, 'pkg', 'value.txt'), 'second\n');
  git(author, 'commit', '--quiet', '-am', 'second');
  git(author, 'push', '--quiet', 'origin', 'HEAD:main');
  return { runner, sha: git(author, 'rev-parse', 'HEAD') };
}

async function run(
  command: string[],
  cwd: string,
  mode: 'trusted' | 'judge-only' = 'trusted'
) {
  const bodies: {
    events?: { message?: string }[];
    completion?: { exitCode: number; status: string };
  }[] = [];
  const fetch = vi.fn(async (_url: URL | string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({});
  });
  const result = await executeDevboxAgentJob(
    { command, leaseId: 'lease', runId: 'run-commit' },
    {
      baseUrl: 'https://example.test',
      cwd,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        TUTURUUU_DEVBOX_EXECUTION_MODE: mode,
      },
      fetch: fetch as typeof globalThis.fetch,
      token: 'fixture',
    }
  );
  const messages = bodies
    .flatMap((body) => body.events ?? [])
    .map((event) => event.message ?? '')
    .join('');
  return { result, messages };
}

describe('commit run envelope', () => {
  it('validates SHA, directory and argv before any work', () => {
    const sha = 'a'.repeat(40);
    for (const spec of [
      { sha: 'abc', prefix: '', command: ['true'] },
      { sha, prefix: '../x', command: ['true'] },
      { sha, prefix: '/abs', command: ['true'] },
      { sha, prefix: 'a/./b', command: ['true'] },
      { sha, prefix: '', command: [] },
      { sha, prefix: '', command: ['__ttr_judge_v1__', 'x'] },
    ])
      expect(() => encodeCommitRun(spec)).toThrow();
    const encoded = encodeCommitRun({ sha, prefix: 'pkg/', command: ['ls'] });
    expect(decodeCommitRun(encoded)).toEqual({
      sha,
      prefix: 'pkg',
      command: ['ls'],
    });
    expect(() => decodeCommitRun([encoded[0]!, 'not-json'])).toThrow(
      'Invalid commit run envelope'
    );
  });
});

describe('commit run on a trusted runner', { timeout: 30_000 }, () => {
  it('runs the exact unfetched commit from its directory and cleans up', async () => {
    const { runner, sha } = await repositories();
    await writeFile(join(runner, 'pkg', 'value.txt'), 'dirty runner state\n');
    const { result, messages } = await run(
      encodeCommitRun({
        sha,
        prefix: 'pkg',
        command: ['sh', '-c', 'cat value.txt; exit 3'],
      }),
      runner
    );
    expect(result).toEqual({ exitCode: 3, status: 'failed' });
    expect(messages).toContain(`remote$ checkout ${sha.slice(0, 12)}`);
    expect(messages).toContain('second');
    expect(messages).not.toContain('dirty runner state');
    expect(git(runner, 'worktree', 'list').split('\n')).toHaveLength(1);
    expect(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith('ttr-commit-run-run-commit')
      )
    ).toEqual([]);
  });

  it('fails cleanly for an unknown commit or missing directory', async () => {
    const { runner, sha } = await repositories();
    const missing = await run(
      encodeCommitRun({ sha: 'f'.repeat(40), prefix: '', command: ['true'] }),
      runner
    );
    expect(missing.result).toEqual({ exitCode: 1, status: 'failed' });
    expect(missing.messages).toContain('Could not fetch commit ffffffffffff');
    const noDir = await run(
      encodeCommitRun({ sha, prefix: 'nope', command: ['true'] }),
      runner
    );
    expect(noDir.messages).toContain('Directory nope does not exist');
    expect(git(runner, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('is rejected outright on a judge-only runner', async () => {
    const { runner, sha } = await repositories();
    const { result, messages } = await run(
      encodeCommitRun({ sha, prefix: '', command: ['true'] }),
      runner,
      'judge-only'
    );
    expect(result).toEqual({ exitCode: 1, status: 'failed' });
    expect(messages).toBe('Host execution policy rejected this job.');
  });
});
