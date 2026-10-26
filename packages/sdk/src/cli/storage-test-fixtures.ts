import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();

/**
 * A primary checkout on `main` with `origin/main` pointing at its first
 * commit, plus helpers to add linked worktrees in known states.
 */
export async function createRepoFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-storage-')));
  const repo = join(root, 'repo');
  await mkdir(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(repo, '.gitignore'), 'node_modules\n');
  await writeFile(join(repo, 'README.md'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

  const worktree = async (
    name: string,
    { commit = false }: { commit?: boolean } = {}
  ) => {
    const path = join(root, name);
    git(repo, 'worktree', 'add', '-q', '-b', name, path, 'main');
    if (commit) {
      await writeFile(join(path, `${name}.txt`), `${name}\n`);
      git(path, 'add', '.');
      git(path, 'commit', '-q', '-m', name);
    }
    return { path, head: git(path, 'rev-parse', 'HEAD') };
  };
  return { root, repo, worktree };
}
