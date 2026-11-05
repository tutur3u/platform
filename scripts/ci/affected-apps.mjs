import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const runGit = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function verdict({ mode, apps, codeChanged, results }) {
  if (mode === 'affected' && codeChanged && apps.length === 0) return { pass: false, reason: 'code changed but no apps were selected' };
  const failed = apps.find((app) => results[app] !== 'success');
  if (failed) return { pass: false, reason: `${failed} result was ${results[failed] ?? 'missing'}` };
  return { pass: true, reason: 'all listed apps succeeded' };
}

function failSafePath(file) {
  return file === 'bun.lock' || file === 'package.json' || file === 'turbo.json' ||
    file.startsWith('.github/') || /^tsconfig[^/]*$/.test(file) || /^(biome|eslint)[^/]*$/.test(file) ||
    /(^|\/)Dockerfile[^/]*$/.test(file) || file.startsWith('.env') || /\.env\.example$/.test(file) ||
    /(^|\/)[^/]*\.env\.example$/.test(file) || file.startsWith('scripts/');
}

function workspaceDirs(root, group) {
  const base = path.join(root, group);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `${group}/${entry.name}`);
}

export function calculate({ base, head = 'HEAD', cwd = process.cwd() }) {
  try {
    const mergeBase = runGit('-C', cwd, 'merge-base', base, head);
    if (!mergeBase) return { mode: 'all', apps: [], reason: 'merge-base could not be resolved' };
    const files = runGit('-C', cwd, 'diff', '--name-only', `${mergeBase}..${head}`).split('\n').filter(Boolean);
    if (files.some(failSafePath)) return { mode: 'all', apps: [], reason: 'changed path requires all apps' };

    const dirs = [...workspaceDirs(cwd, 'apps'), ...workspaceDirs(cwd, 'packages')];
    const byName = new Map();
    const dependencies = new Map();
    for (const dir of dirs) {
      const pkg = JSON.parse(readFileSync(path.join(cwd, dir, 'package.json'), 'utf8'));
      if (!pkg.name) throw new Error(`workspace missing name: ${dir}`);
      byName.set(pkg.name, dir);
      dependencies.set(dir, Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }));
    }
    const dependents = new Map(dirs.map((dir) => [dir, new Set()]));
    for (const [dir, deps] of dependencies) for (const dep of deps) {
      const target = byName.get(dep);
      if (target) dependents.get(target).add(dir);
    }

    const owners = (file) => dirs.filter((dir) => file.startsWith(`${dir}/`)).sort((a, b) => b.length - a.length)[0];
    const seeds = new Set();
    for (const file of files) {
      const owner = owners(file);
      if (owner) seeds.add(owner);
      else if (!(file.endsWith('.md') || file.startsWith('docs/'))) return { mode: 'all', apps: [], reason: `changed file outside workspace: ${file}` };
    }
    const affected = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) for (const dependent of dependents.get(queue.shift()) ?? []) if (!affected.has(dependent)) {
      affected.add(dependent); queue.push(dependent);
    }
    return { mode: 'affected', apps: [...affected].filter((dir) => dir.startsWith('apps/')).sort(), reason: files.length ? 'workspace and documentation changes' : 'no changed files' };
  } catch (error) {
    return { mode: 'all', apps: [], reason: `error: ${error.message}` };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const headIndex = args.indexOf('--head');
  if (baseIndex < 0 || !args[baseIndex + 1]) {
    console.log(JSON.stringify({ mode: 'all', apps: [], reason: 'usage: --base <ref> [--head HEAD]' }));
  } else {
    console.log(JSON.stringify(calculate({ base: args[baseIndex + 1], head: headIndex >= 0 ? args[headIndex + 1] : 'HEAD' })));
  }
}
