#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BUILD_INFO_ROUTE = path.join(
  'src',
  'app',
  'api',
  'build-info',
  'route.ts'
);
const VALID_FRAMEWORKS = new Set(['next', 'tanstack-start']);

function targetLabel(target, index) {
  return typeof target?.app === 'string' && target.app.length > 0
    ? target.app
    : `target ${index + 1}`;
}

function isSafeRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    path.isAbsolute(value)
  ) {
    return false;
  }

  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateBuildInfoCoverage({
  readFileSync = fs.readFileSync,
  rootDir = REPO_ROOT,
  statSync = fs.statSync,
  targets,
}) {
  if (!Array.isArray(targets)) {
    return ['Vercel target registry must export an array.'];
  }

  const errors = [];

  for (const [index, target] of targets.entries()) {
    const label = targetLabel(target, index);
    const framework = target?.framework;

    if (!VALID_FRAMEWORKS.has(framework)) {
      errors.push(
        `[${label}] Invalid framework ${JSON.stringify(framework)}; expected "next" or "tanstack-start".`
      );
    }

    const hasBuildInfoApp =
      typeof target?.buildInfoApp === 'string' &&
      target.buildInfoApp.length > 0;

    if (framework === 'next' && !hasBuildInfoApp) {
      errors.push(
        `[${label}] Missing buildInfoApp; Next targets must declare their build-info response identity.`
      );
    } else if (framework === 'tanstack-start' && 'buildInfoApp' in target) {
      errors.push(
        `[${label}] Unexpected buildInfoApp; tanstack-start targets do not use the Next build-info route contract.`
      );
    }

    if (!isSafeRelativePath(target?.appPath)) {
      errors.push(
        `[${label}] Invalid appPath ${JSON.stringify(target?.appPath)}; expected a non-empty repo-relative path.`
      );
      continue;
    }

    const targetRoot = path.resolve(rootDir, target.appPath);

    try {
      if (!statSync(targetRoot).isDirectory()) {
        errors.push(
          `[${label}] Target root is not a directory: ${target.appPath}.`
        );
        continue;
      }
    } catch {
      errors.push(`[${label}] Target root does not exist: ${target.appPath}.`);
      continue;
    }

    if (framework !== 'next') {
      continue;
    }

    if (!hasBuildInfoApp) {
      continue;
    }

    const routePath = path.join(targetRoot, BUILD_INFO_ROUTE);
    let routeSource;

    try {
      routeSource = readFileSync(routePath, 'utf8');
    } catch {
      errors.push(
        `[${label}] Missing build-info route: ${path.join(target.appPath, BUILD_INFO_ROUTE)}.`
      );
      continue;
    }

    const expectedIdentity = escapeRegExp(target.buildInfoApp);
    const handlerPattern = new RegExp(
      `createBuildInfoHandler\\(\\s*(['"])${expectedIdentity}\\1\\s*\\)`
    );

    if (!handlerPattern.test(routeSource)) {
      errors.push(
        `[${label}] Build-info route identity mismatch: expected createBuildInfoHandler(${JSON.stringify(target.buildInfoApp)}) in ${path.join(target.appPath, BUILD_INFO_ROUTE)}.`
      );
    }
  }

  return errors.sort((left, right) => left.localeCompare(right));
}

async function loadVercelWorkflowTargets(registryPath) {
  const registry = await import(pathToFileURL(registryPath).href);
  return registry.vercelWorkflowTargets;
}

function parseArgs(argv) {
  let rootDir = REPO_ROOT;
  let registryPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--root') {
      rootDir = path.resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (argument === '--registry') {
      registryPath = path.resolve(argv[index + 1] ?? '');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {
    registryPath: registryPath ?? path.join(rootDir, 'tuturuuu.ts'),
    rootDir,
  };
}

async function main(argv = process.argv.slice(2)) {
  const { registryPath, rootDir } = parseArgs(argv);
  const targets = await loadVercelWorkflowTargets(registryPath);
  const errors = validateBuildInfoCoverage({ rootDir, targets });

  if (errors.length > 0) {
    console.error('Build-info coverage validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  const nextTargetCount = targets.filter(
    (target) => target.framework === 'next'
  ).length;
  console.log(
    `Build-info coverage is complete for ${nextTargetCount} Next targets (${targets.length} registered Vercel targets).`
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

module.exports = {
  BUILD_INFO_ROUTE,
  loadVercelWorkflowTargets,
  main,
  parseArgs,
  validateBuildInfoCoverage,
};
