import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Cheap scanner for relative imports that cross a workspace boundary
// (e.g. `../../../packages/utils/src/x` or `../../apps/cloudflare/y.mjs`).
// Such imports bypass package.json, so the workspace graph cannot see them;
// they must be listed in affected-apps.extra-edges.json.
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
// Any quoted relative path literal: covers import/export-from, require, dynamic
// import(), vi.mock(), config files and fixture paths without parsing syntax.
const RELATIVE_LITERAL = /(['"`])(\.{1,2}\/[^'"`\n]*)\1/g;

// Filename and runner-config matcher only. The scanner does not drop these files:
// a test importer is an edge, and a directory named test/, tests/ or e2e/ is not.
export const isTestOnlyFile = (file) =>
  /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/.test(file) ||
  /(?:^|\/)(?:vitest|playwright|jest)\.config\.[cm]?[jt]s$/.test(file);

export function listWorkspaceDirs(cwd) {
  const out = execFileSync('git', ['-C', cwd, 'ls-files', '-z', 'apps', 'packages'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const files = out.split('\0').filter(Boolean);
  return { files, dirs: new Set(files.map((file) => file.split('/').slice(0, 2).join('/'))) };
}

export function scanCrossWorkspaceImports(cwd) {
  const { files, dirs } = listWorkspaceDirs(cwd);
  const ownerOf = (file) => {
    const owner = file.split('/').slice(0, 2).join('/');
    return dirs.has(owner) ? owner : undefined;
  };
  const found = [];
  for (const file of files) {
    if (!SOURCE_FILE.test(file) || !existsSync(path.join(cwd, file))) continue;
    const importer = ownerOf(file);
    const source = readFileSync(path.join(cwd, file), 'utf8');
    if (!source.includes('./')) continue;
    for (const match of source.matchAll(RELATIVE_LITERAL)) {
      const target = path.posix.join(path.posix.dirname(file), match[2]);
      const workspace = ownerOf(target);
      if (importer && workspace && workspace !== importer) found.push({ importer, file, target, workspace });
    }
  }
  return found;
}

// `importer` must be re-evaluated when anything under `target` changes.
export function undeclaredImports(found, declared) {
  return found.filter(({ importer, workspace }) => !declared(importer, workspace));
}

// Longest shared directory (with trailing slash) of the given paths, never shorter than the workspace dir.
function commonDirectory(workspace, targets) {
  let parts = path.posix.dirname(targets[0]).split('/');
  for (const target of targets.slice(1)) {
    const next = path.posix.dirname(target).split('/');
    let i = 0;
    while (i < parts.length && i < next.length && parts[i] === next[i]) i++;
    parts = parts.slice(0, i);
  }
  const prefix = parts.join('/');
  return `${prefix.startsWith(`${workspace}`) ? prefix : workspace}/`;
}

// Suggested extra-edges entries: { "<source prefix>/": ["<dependent dir>", ...] }.
export function suggestEdges(missing) {
  const pairs = new Map();
  for (const { importer, workspace, target } of missing) {
    const key = `${importer}\0${workspace}`;
    if (!pairs.has(key)) pairs.set(key, { importer, workspace, targets: [] });
    pairs.get(key).targets.push(target);
  }
  const edges = {};
  for (const { importer, workspace, targets } of pairs.values()) {
    const prefix = commonDirectory(workspace, targets);
    (edges[prefix] ??= new Set()).add(importer);
  }
  return Object.fromEntries(Object.keys(edges).sort().map((prefix) => [prefix, [...edges[prefix]].sort()]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage: node scripts/ci/affected-apps-imports.mjs  -> prints suggested entries for undeclared imports.
  const { loadGraph, loadExtraEdges, coveredByExtraEdges } = await import('./affected-apps.mjs');
  const cwd = process.cwd();
  const graph = loadGraph(cwd);
  const missing = undeclaredImports(scanCrossWorkspaceImports(cwd), graph.declares)
    .filter(({ importer, target }) => !coveredByExtraEdges(loadExtraEdges(), target, importer));
  console.log(JSON.stringify(suggestEdges(missing), null, 2));
}
