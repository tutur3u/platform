// Type-check affected workspaces without builds. Local checkouts often lack
// the `dist` declarations CI builds first, so diagnostics are classified:
// missing-declaration noise is ignored, and cascades outside changed files are
// advisory. With every declaration present, all diagnostics block.

const fs = require('node:fs');
const path = require('node:path');

const MISSING_MODULE_CODES = new Set([2305, 2307, 7016]);

function readJson(file, fsImpl = fs) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Resolve the tsconfig projects a workspace's `type-check` script checks,
// following `bun run <script>` chains such as Calendar's app/worker split.
function typeCheckProjects(workspace, scripts = {}) {
  const projects = [];
  const visit = (name, depth) => {
    const script = scripts[name];
    if (!script || depth > 4) return;
    for (const segment of script.split(/&&|\|\||;/)) {
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      if (tokens[0] === 'bun') {
        const target = tokens[1] === 'run' ? tokens[2] : tokens[1];
        if (target && scripts[target]) {
          visit(target, depth + 1);
          continue;
        }
      }
      const checker = tokens.some(
        (token) =>
          /(^|\/)(tsc|tsgo)$/.test(token) || token.endsWith('run-tsc-build.js')
      );
      if (!checker) continue;
      const flag = tokens.findIndex((t) => t === '-p' || t === '--project');
      let project = flag >= 0 ? tokens[flag + 1] : null;
      const build = tokens.indexOf('--build');
      if (!project && build >= 0 && tokens[build + 1]?.match(/^[^-]/)) {
        project = tokens[build + 1];
      }
      project ??= 'tsconfig.json';
      if (!project.endsWith('.json')) {
        project = path.posix.join(project, 'tsconfig.json');
      }
      projects.push(path.posix.join(workspace, project));
    }
  };
  visit('type-check', 0);
  return [...new Set(projects)];
}

// Workspace packages whose published types point into an unbuilt `dist`.
function missingDistPackages(root, fsImpl = fs) {
  const missing = new Map();
  const packagesDir = path.join(root, 'packages');
  if (!fsImpl.existsSync(packagesDir)) return missing;
  for (const name of fsImpl.readdirSync(packagesDir)) {
    const manifest = readJson(
      path.join(packagesDir, name, 'package.json'),
      fsImpl
    );
    if (!manifest?.name) continue;
    const rootExport = manifest.exports?.['.'];
    const types =
      manifest.types ??
      manifest.typings ??
      (typeof rootExport === 'object' ? rootExport?.types : null);
    if (typeof types !== 'string' || !/^\.?\/?dist\//.test(types)) continue;
    if (!fsImpl.existsSync(path.join(packagesDir, name, types))) {
      missing.set(manifest.name, `packages/${name}`);
    }
  }
  return missing;
}

function citesMissingPackage(message, missing) {
  const match = /['"](@[^/'"]+\/[^/'"]+)/.exec(message);
  return Boolean(match && missing.has(match[1]));
}

/**
 * Split diagnostics into blocking, advisory and ignored groups. Paths are
 * repository-relative because checkers run from the repository root.
 */
function classifyDiagnostics(diagnostics, { changedFiles, missing }) {
  const result = { blocking: [], advisory: [], ignored: [] };
  if (!missing.size) {
    result.blocking.push(...diagnostics);
    return result;
  }
  const filesWithMissingImports = new Set();
  for (const diagnostic of diagnostics) {
    if (
      MISSING_MODULE_CODES.has(diagnostic.code) &&
      citesMissingPackage(diagnostic.message, missing)
    ) {
      filesWithMissingImports.add(diagnostic.file);
    }
  }
  for (const diagnostic of diagnostics) {
    if (
      MISSING_MODULE_CODES.has(diagnostic.code) &&
      citesMissingPackage(diagnostic.message, missing)
    ) {
      result.ignored.push(diagnostic);
    } else if (
      !diagnostic.file ||
      (diagnostic.code >= 5000 && diagnostic.code < 7000)
    ) {
      // Configuration diagnostics (e.g. TS6059 rootDir) never depend on dist.
      result.blocking.push(diagnostic);
    } else if (
      changedFiles.has(diagnostic.file) &&
      !filesWithMissingImports.has(diagnostic.file)
    ) {
      result.blocking.push(diagnostic);
    } else {
      result.advisory.push(diagnostic);
    }
  }
  return result;
}

module.exports = {
  MISSING_MODULE_CODES,
  classifyDiagnostics,
  missingDistPackages,
  typeCheckProjects,
};
