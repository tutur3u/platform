const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  dependencyFields,
  resolveWorkspaceDependencyVersion,
} = require('./prepare-npm-package-manifest.js');

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_WAIT_ATTEMPTS = 60;
const DEFAULT_WAIT_DELAY_MS = 10_000;
const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
const WORKFLOW_PACKAGE_PATH_PATTERN =
  /["'](packages\/[^"']+\/package\.json)["']/g;
const FAILED_WORKFLOW_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expandWorkspacePattern(repoRoot, pattern) {
  if (!pattern.endsWith('/*')) return [];

  const workspaceRoot = path.join(repoRoot, pattern.slice(0, -2));
  if (!fs.existsSync(workspaceRoot)) return [];

  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workspaceRoot, entry.name, 'package.json'))
    .filter((packageJsonPath) => fs.existsSync(packageJsonPath));
}

function getWorkspacePackageJsonPaths(repoRoot) {
  const rootPackageJson = readJson(path.join(repoRoot, 'package.json'));
  const workspaces = rootPackageJson.workspaces ?? [];

  return workspaces.flatMap((pattern) =>
    expandWorkspacePattern(repoRoot, pattern)
  );
}

function getWorkspacePackages(repoRoot) {
  const workspacePackages = new Map();

  for (const packageJsonPath of getWorkspacePackageJsonPaths(repoRoot)) {
    const packageJson = readJson(packageJsonPath);

    if (!packageJson.name) continue;

    workspacePackages.set(packageJson.name, {
      packageDir: path.relative(repoRoot, path.dirname(packageJsonPath)),
      packageJson,
      packageJsonPath,
      version: packageJson.version,
    });
  }

  return workspacePackages;
}

function getReleaseWorkflowFiles(repoRoot) {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');

  if (!fs.existsSync(workflowsDir)) return [];

  return fs
    .readdirSync(workflowsDir)
    .filter((fileName) => /^release-.+-package\.ya?ml$/u.test(fileName))
    .sort();
}

function getPublishableWorkspacePackages(repoRoot) {
  const workspacePackages = getWorkspacePackages(repoRoot);
  const publishablePackages = new Map();

  for (const workflowName of getReleaseWorkflowFiles(repoRoot)) {
    const workflowPath = path.join(
      repoRoot,
      '.github',
      'workflows',
      workflowName
    );
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const packagePaths = [
      ...workflow.matchAll(WORKFLOW_PACKAGE_PATH_PATTERN),
    ].map((match) => match[1]);

    for (const packageJsonRelativePath of packagePaths) {
      const packageDir = path.dirname(packageJsonRelativePath);
      const packageJsonPath = path.join(repoRoot, packageJsonRelativePath);
      const packageJson = readJson(packageJsonPath);
      const workspacePackage = workspacePackages.get(packageJson.name);

      if (!workspacePackage || !packageJson.version) continue;

      publishablePackages.set(packageJson.name, {
        packageDir,
        packageJson,
        packageJsonPath,
        version: packageJson.version,
        workflowName,
      });
    }
  }

  return publishablePackages;
}

function getPackageInfo(repoRoot, packageDir) {
  const packageJsonPath = path.join(repoRoot, packageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);

  if (!packageJson.name || !packageJson.version) {
    throw new Error(`${packageDir}/package.json must define name and version.`);
  }

  return {
    packageDir,
    packageJson,
    packageJsonPath,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
  };
}

function getWorkspaceDependencies({ packageDir, repoRoot }) {
  const { packageJson } = getPackageInfo(repoRoot, packageDir);
  const workspacePackages = getWorkspacePackages(repoRoot);
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const dependencies = [];
  const seen = new Set();

  for (const field of dependencyFields) {
    const packageDependencies = packageJson[field] ?? {};

    for (const [dependencyName, dependencyRange] of Object.entries(
      packageDependencies
    ).sort(([left], [right]) => left.localeCompare(right))) {
      if (
        typeof dependencyRange !== 'string' ||
        !dependencyRange.startsWith('workspace:')
      ) {
        continue;
      }

      const workspacePackage = workspacePackages.get(dependencyName);
      const publishablePackage = publishablePackages.get(dependencyName);

      if (!workspacePackage || !publishablePackage) continue;

      const dependencyVersion = resolveWorkspaceDependencyVersion(
        dependencyRange,
        workspacePackage.version
      );
      const key = `${dependencyName}@${dependencyVersion}`;

      if (seen.has(key)) continue;
      seen.add(key);

      dependencies.push({
        field,
        packageDir: publishablePackage.packageDir,
        packageName: dependencyName,
        packageVersion: dependencyVersion,
        workflowName: publishablePackage.workflowName,
      });
    }
  }

  return dependencies;
}

function packageHasWorkspaceDependency(packageJson, dependencyName) {
  for (const field of dependencyFields) {
    const dependencyRange = packageJson[field]?.[dependencyName];

    if (
      typeof dependencyRange === 'string' &&
      dependencyRange.startsWith('workspace:')
    ) {
      return true;
    }
  }

  return false;
}

function getDependentWorkspacePackages({
  packageDir,
  registry = DEFAULT_REGISTRY,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const { packageName } = getPackageInfo(repoRoot, packageDir);
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const dependents = [];

  for (const publishablePackage of [...publishablePackages.values()].sort(
    (left, right) => left.packageDir.localeCompare(right.packageDir)
  )) {
    if (publishablePackage.packageDir === packageDir) continue;

    if (
      !packageHasWorkspaceDependency(
        publishablePackage.packageJson,
        packageName
      )
    ) {
      continue;
    }

    if (
      versionExists({
        packageName: publishablePackage.packageJson.name,
        packageVersion: publishablePackage.version,
        registry,
      })
    ) {
      continue;
    }

    dependents.push({
      packageDir: publishablePackage.packageDir,
      packageName: publishablePackage.packageJson.name,
      packageVersion: publishablePackage.version,
      workflowName: publishablePackage.workflowName,
    });
  }

  return dependents;
}

function packageVersionExists({
  npmCommand = 'npm',
  packageName,
  packageVersion,
  registry = DEFAULT_REGISTRY,
}) {
  const result = spawnSync(
    npmCommand,
    [
      'view',
      `${packageName}@${packageVersion}`,
      'version',
      '--registry',
      registry,
    ],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  return result.status === 0;
}

function getGitHubToken(env = process.env) {
  return env.GH_TOKEN || env.GITHUB_TOKEN || '';
}

function buildWorkflowRunsUrl({ env = process.env, workflowName }) {
  if (!env.GITHUB_REPOSITORY || !workflowName) return null;

  const apiUrl = (env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(
    /\/$/u,
    ''
  );
  const params = new URLSearchParams({
    per_page: '20',
  });

  if (env.GITHUB_REF_NAME) {
    params.set('branch', env.GITHUB_REF_NAME);
  }

  return `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(workflowName)}/runs?${params}`;
}

function getWorkflowDispatchRef(env = process.env) {
  if (env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;

  const ref = env.GITHUB_REF;

  if (ref?.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }

  return null;
}

function buildWorkflowDispatchUrl({ env = process.env, workflowName }) {
  if (!env.GITHUB_REPOSITORY || !workflowName) return null;

  const apiUrl = (env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(
    /\/$/u,
    ''
  );

  return `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(workflowName)}/dispatches`;
}

async function getRelatedWorkflowRunStatus({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  workflowName,
}) {
  const url = buildWorkflowRunsUrl({ env, workflowName });
  const token = getGitHubToken(env);

  if (!url || !env.GITHUB_SHA || !token || typeof fetchImpl !== 'function') {
    return { state: 'unknown' };
  }

  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tuturuuu-package-release-readiness',
      },
    });

    if (!response.ok) {
      logger.log(
        `Unable to inspect ${workflowName} release workflow status: ` +
          `${response.status} ${response.statusText}`
      );
      return { state: 'unknown' };
    }

    const payload = await response.json();
    const workflowRun = (payload.workflow_runs ?? [])
      .filter((run) => run.head_sha === env.GITHUB_SHA)
      .sort((left, right) =>
        String(right.run_started_at ?? '').localeCompare(
          String(left.run_started_at ?? '')
        )
      )[0];

    if (!workflowRun) {
      return { state: 'missing' };
    }

    if (workflowRun.status === 'completed') {
      if (workflowRun.conclusion === 'success') {
        return {
          state: 'success',
          url: workflowRun.html_url,
        };
      }

      if (FAILED_WORKFLOW_CONCLUSIONS.has(workflowRun.conclusion)) {
        return {
          conclusion: workflowRun.conclusion,
          state: 'failed',
          url: workflowRun.html_url,
        };
      }
    }

    return {
      state: 'pending',
      status: workflowRun.status,
      url: workflowRun.html_url,
    };
  } catch (error) {
    logger.log(
      `Unable to inspect ${workflowName} release workflow status: ${error.message}`
    );
    return { state: 'unknown' };
  }
}

async function dispatchRelatedWorkflow({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  workflowName,
}) {
  const url = buildWorkflowDispatchUrl({ env, workflowName });
  const token = getGitHubToken(env);
  const ref = getWorkflowDispatchRef(env);

  if (!url || !token || !ref || typeof fetchImpl !== 'function') {
    throw new Error(
      `Unable to dispatch ${workflowName}: missing GitHub repository, token, ref, or fetch implementation.`
    );
  }

  const response = await fetchImpl(url, {
    body: JSON.stringify({
      ref,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tuturuuu-package-release-readiness',
    },
    method: 'POST',
  });

  if (!response.ok) {
    let body = '';

    try {
      body = await response.text();
    } catch {
      body = '';
    }

    throw new Error(
      `Unable to dispatch ${workflowName} on ${ref}: ` +
        `${response.status} ${response.statusText}${body ? ` ${body}` : ''}. ` +
        'Ensure the workflow has workflow_dispatch enabled and this job has actions: write permission.'
    );
  }

  logger.log(`Dispatched ${workflowName} on ${ref}.`);

  return {
    ref,
    state: 'dispatched',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPackageVersion({
  attempts = DEFAULT_WAIT_ATTEMPTS,
  delayMs = DEFAULT_WAIT_DELAY_MS,
  env = process.env,
  getRelatedWorkflowStatus = getRelatedWorkflowRunStatus,
  logger = console,
  packageName,
  packageVersion,
  relatedWorkflow,
  registry = DEFAULT_REGISTRY,
  dispatchWorkflow = dispatchRelatedWorkflow,
  versionExists = packageVersionExists,
}) {
  let recoveryDispatchStarted = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (versionExists({ packageName, packageVersion, registry })) {
      logger.log(`${packageName}@${packageVersion} is visible on npm.`);
      return true;
    }

    if (relatedWorkflow?.workflowName) {
      const workflowStatus = await getRelatedWorkflowStatus({
        env,
        workflowName: relatedWorkflow.workflowName,
      });

      if (workflowStatus.state === 'failed') {
        throw new Error(
          `${packageName}@${packageVersion} is blocked because ` +
            `${relatedWorkflow.workflowName} failed for ${env.GITHUB_SHA}. ` +
            `Conclusion: ${workflowStatus.conclusion}. ` +
            `Run: ${workflowStatus.url ?? '(unavailable)'}`
        );
      }

      if (workflowStatus.state === 'missing' && !recoveryDispatchStarted) {
        await dispatchWorkflow({
          env,
          logger,
          workflowName: relatedWorkflow.workflowName,
        });
        recoveryDispatchStarted = true;
      }
    }

    if (attempt < attempts) {
      logger.log(
        `Waiting for ${packageName}@${packageVersion} on npm ` +
          `(${attempt}/${attempts}).`
      );
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${packageName}@${packageVersion} did not become visible on npm ` +
      `after ${attempts} attempts.`
  );
}

async function gatePackageRelease({
  dispatchWorkflow = dispatchRelatedWorkflow,
  env = process.env,
  getRelatedWorkflowStatus = getRelatedWorkflowRunStatus,
  logger = console,
  packageDir,
  registry = DEFAULT_REGISTRY,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const { packageName, packageVersion } = getPackageInfo(repoRoot, packageDir);
  const shouldPublish = !versionExists({
    packageName,
    packageVersion,
    registry,
  });
  const dependents = getDependentWorkspacePackages({
    packageDir,
    registry,
    repoRoot,
    versionExists,
  });
  const outputs = {
    dependencies_ready: 'true',
    dependent_workflows: JSON.stringify(
      dependents.map((dependent) => dependent.workflowName)
    ),
    package_name: packageName,
    package_version: packageVersion,
    should_publish: shouldPublish ? 'true' : 'false',
  };

  if (!shouldPublish) {
    logger.log(`${packageName}@${packageVersion} already exists on npm.`);
    return outputs;
  }

  const dependencies = getWorkspaceDependencies({ packageDir, repoRoot });

  if (dependencies.length === 0) {
    logger.log(`${packageDir} has no publishable workspace dependencies.`);
    return outputs;
  }

  let dependenciesReady = true;

  for (const dependency of dependencies) {
    if (
      versionExists({
        packageName: dependency.packageName,
        packageVersion: dependency.packageVersion,
        registry,
      })
    ) {
      logger.log(
        `${dependency.packageName}@${dependency.packageVersion} is visible on npm.`
      );
      continue;
    }

    const workflowStatus = await getRelatedWorkflowStatus({
      env,
      workflowName: dependency.workflowName,
    });

    if (workflowStatus.state === 'failed') {
      throw new Error(
        `${packageName}@${packageVersion} is blocked because ` +
          `${dependency.workflowName} failed for ${env.GITHUB_SHA}. ` +
          `Conclusion: ${workflowStatus.conclusion}. ` +
          `Run: ${workflowStatus.url ?? '(unavailable)'}`
      );
    }

    if (workflowStatus.state === 'success') {
      throw new Error(
        `${packageName}@${packageVersion} is blocked because ` +
          `${dependency.packageName}@${dependency.packageVersion} is missing ` +
          `from npm even though ${dependency.workflowName} completed ` +
          `successfully for ${env.GITHUB_SHA}.`
      );
    }

    if (workflowStatus.state === 'missing') {
      await dispatchWorkflow({
        env,
        logger,
        workflowName: dependency.workflowName,
      });
      dependenciesReady = false;
      logger.log(
        `${packageName}@${packageVersion} deferred until ` +
          `${dependency.packageName}@${dependency.packageVersion} is published.`
      );
      continue;
    }

    if (workflowStatus.state === 'pending') {
      dependenciesReady = false;
      logger.log(
        `${packageName}@${packageVersion} deferred while ` +
          `${dependency.workflowName} is ${workflowStatus.status ?? 'pending'}.`
      );
      continue;
    }

    throw new Error(
      `${packageName}@${packageVersion} cannot confirm ` +
        `${dependency.packageName}@${dependency.packageVersion} readiness ` +
        `because ${dependency.workflowName} status is unreadable.`
    );
  }

  outputs.dependencies_ready = dependenciesReady ? 'true' : 'false';

  if (dependenciesReady) {
    logger.log(`${packageName}@${packageVersion} dependencies are ready.`);
  } else {
    logger.log(
      `${packageName}@${packageVersion} release deferred without occupying a runner.`
    );
  }

  return outputs;
}

async function dispatchDependentWorkflows({
  dispatchWorkflow = dispatchRelatedWorkflow,
  env = process.env,
  logger = console,
  packageDir,
  registry = DEFAULT_REGISTRY,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const { packageName, packageVersion } = getPackageInfo(repoRoot, packageDir);

  if (
    !versionExists({
      packageName,
      packageVersion,
      registry,
    })
  ) {
    throw new Error(
      `Refusing to dispatch dependent workflows before ` +
        `${packageName}@${packageVersion} is visible on npm.`
    );
  }

  const dependents = getDependentWorkspacePackages({
    packageDir,
    registry,
    repoRoot,
    versionExists,
  });
  const dispatched = [];

  if (dependents.length === 0) {
    logger.log(
      `${packageName}@${packageVersion} has no unpublished dependents.`
    );
    return dispatched;
  }

  for (const dependent of dependents) {
    await dispatchWorkflow({
      env,
      logger,
      workflowName: dependent.workflowName,
    });
    dispatched.push(dependent);
  }

  return dispatched;
}

function appendGithubOutput(outputs, env = process.env) {
  if (!env.GITHUB_OUTPUT) return;

  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`
  );
  fs.appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

function getVersionCheckOutputs({
  packageDir,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const { packageName, packageVersion } = getPackageInfo(repoRoot, packageDir);
  const shouldPublish = !versionExists({
    packageName,
    packageVersion,
  });

  return {
    package_name: packageName,
    package_version: packageVersion,
    should_publish: shouldPublish ? 'true' : 'false',
  };
}

function runGitDiff({ baseRef, headRef, repoRoot }) {
  let result = spawnSync('git', ['diff', '--name-only', baseRef, headRef], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0 && /bad object/u.test(result.stderr)) {
    spawnSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    result = spawnSync('git', ['diff', '--name-only', baseRef, headRef], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  if (result.status !== 0) {
    throw new Error(
      `Unable to resolve changed files between ${baseRef} and ${headRef}: ` +
        result.stderr.trim()
    );
  }

  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function getChangedFilesFromEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return [];

  const event = readJson(eventPath);
  const changedFiles = new Set();

  for (const commit of event.commits ?? []) {
    for (const field of ['added', 'modified', 'removed']) {
      for (const changedFile of commit[field] ?? []) {
        changedFiles.add(changedFile);
      }
    }
  }

  return [...changedFiles].sort();
}

function getBeforeRefFromEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return null;

  const event = readJson(eventPath);

  return typeof event.before === 'string' && !/^0+$/u.test(event.before)
    ? event.before
    : null;
}

function getChangedFiles({
  env = process.env,
  headRef = env.GITHUB_SHA || 'HEAD',
  repoRoot,
}) {
  const eventChangedFiles = getChangedFilesFromEventPayload(
    env.GITHUB_EVENT_PATH
  );

  if (eventChangedFiles.length > 0) {
    return eventChangedFiles;
  }

  const beforeRef =
    env.GITHUB_EVENT_BEFORE ??
    getBeforeRefFromEventPayload(env.GITHUB_EVENT_PATH);

  if (beforeRef && !/^0+$/u.test(beforeRef)) {
    return runGitDiff({
      baseRef: beforeRef,
      headRef,
      repoRoot,
    });
  }

  return runGitDiff({
    baseRef: 'HEAD^',
    headRef,
    repoRoot,
  });
}

function getLatestCommitChangedFiles({
  headRef = process.env.GITHUB_SHA || 'HEAD',
  repoRoot,
}) {
  return runGitDiff({
    baseRef: 'HEAD^',
    headRef,
    repoRoot,
  });
}

function getChangedPublishablePackages({ changedFiles, repoRoot }) {
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const publishableByPackageJsonPath = new Map(
    [...publishablePackages.values()].map((packageInfo) => [
      `${packageInfo.packageDir}/package.json`,
      packageInfo,
    ])
  );
  const changedPackages = new Map();

  for (const changedFile of changedFiles) {
    const packageInfo = publishableByPackageJsonPath.get(changedFile);

    if (packageInfo) {
      changedPackages.set(packageInfo.packageDir, packageInfo);
    }
  }

  return [...changedPackages.values()].sort((left, right) =>
    left.packageDir.localeCompare(right.packageDir)
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getWaitOptions(env = process.env) {
  return {
    attempts: parsePositiveInteger(
      env.PACKAGE_RELEASE_WAIT_ATTEMPTS,
      DEFAULT_WAIT_ATTEMPTS
    ),
    delayMs: parsePositiveInteger(
      env.PACKAGE_RELEASE_WAIT_DELAY_MS,
      DEFAULT_WAIT_DELAY_MS
    ),
    registry: env.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY,
  };
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const [command, ...args] = argv;
  const repoRoot = path.resolve(__dirname, '..', '..');
  const waitOptions = getWaitOptions(env);

  if (command === 'check-version') {
    const [packageDir] = args;

    if (!packageDir) {
      throw new Error(
        'Usage: node scripts/ci/package-release-readiness.js check-version <package-dir>'
      );
    }

    const outputs = getVersionCheckOutputs({ packageDir, repoRoot });
    appendGithubOutput(outputs, env);

    if (outputs.should_publish === 'true') {
      console.log(
        `${outputs.package_name}@${outputs.package_version} is not visible on npm; publishing is required.`
      );
    } else {
      console.log(
        `${outputs.package_name}@${outputs.package_version} already exists on npm; skipping publish.`
      );
    }

    return;
  }

  if (command === 'wait-version') {
    const [packageName, packageVersion] = args;

    if (!packageName || !packageVersion) {
      throw new Error(
        'Usage: node scripts/ci/package-release-readiness.js wait-version <package-name> <package-version>'
      );
    }

    await waitForPackageVersion({
      ...waitOptions,
      packageName,
      packageVersion,
    });
    return;
  }

  if (command === 'gate-package-release') {
    const [packageDir] = args;

    if (!packageDir) {
      throw new Error(
        'Usage: node scripts/ci/package-release-readiness.js gate-package-release <package-dir>'
      );
    }

    const outputs = await gatePackageRelease({
      ...waitOptions,
      env,
      packageDir,
      repoRoot,
    });
    appendGithubOutput(outputs, env);
    return;
  }

  if (command === 'dispatch-dependent-workflows') {
    const [packageDir] = args;

    if (!packageDir) {
      throw new Error(
        'Usage: node scripts/ci/package-release-readiness.js dispatch-dependent-workflows <package-dir>'
      );
    }

    await dispatchDependentWorkflows({
      ...waitOptions,
      env,
      packageDir,
      repoRoot,
    });
    return;
  }

  if (command === 'wait-workspace-dependencies') {
    const [packageDir] = args;

    if (!packageDir) {
      throw new Error(
        'Usage: node scripts/ci/package-release-readiness.js wait-workspace-dependencies <package-dir>'
      );
    }

    const dependencies = getWorkspaceDependencies({ packageDir, repoRoot });

    if (dependencies.length === 0) {
      console.log(`${packageDir} has no publishable workspace dependencies.`);
      return;
    }

    for (const dependency of dependencies) {
      await waitForPackageVersion({
        ...waitOptions,
        env,
        packageName: dependency.packageName,
        packageVersion: dependency.packageVersion,
        relatedWorkflow: {
          workflowName: dependency.workflowName,
        },
      });
    }

    return;
  }

  if (command === 'wait-changed-package-versions') {
    const changedFiles = getLatestCommitChangedFiles({
      headRef: env.GITHUB_SHA || 'HEAD',
      repoRoot,
    });
    const changedPackages = getChangedPublishablePackages({
      changedFiles,
      repoRoot,
    });

    if (changedPackages.length === 0) {
      console.log('No changed publishable package versions detected.');
      return;
    }

    for (const packageInfo of changedPackages) {
      await waitForPackageVersion({
        ...waitOptions,
        env,
        packageName: packageInfo.packageJson.name,
        packageVersion: packageInfo.version,
        relatedWorkflow: {
          workflowName: packageInfo.workflowName,
        },
      });
    }

    return;
  }

  throw new Error(
    'Usage: node scripts/ci/package-release-readiness.js ' +
      '<check-version|wait-version|gate-package-release|dispatch-dependent-workflows|wait-workspace-dependencies|wait-changed-package-versions>'
  );
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_REGISTRY,
  DEFAULT_GITHUB_API_URL,
  DEFAULT_WAIT_ATTEMPTS,
  DEFAULT_WAIT_DELAY_MS,
  FAILED_WORKFLOW_CONCLUSIONS,
  buildWorkflowRunsUrl,
  buildWorkflowDispatchUrl,
  dispatchDependentWorkflows,
  dispatchRelatedWorkflow,
  gatePackageRelease,
  getBeforeRefFromEventPayload,
  getChangedFiles,
  getChangedFilesFromEventPayload,
  getChangedPublishablePackages,
  getLatestCommitChangedFiles,
  getDependentWorkspacePackages,
  getPackageInfo,
  getPublishableWorkspacePackages,
  getReleaseWorkflowFiles,
  getRelatedWorkflowRunStatus,
  getVersionCheckOutputs,
  getWaitOptions,
  getWorkspaceDependencies,
  getWorkspacePackages,
  getGitHubToken,
  packageVersionExists,
  runCli,
  waitForPackageVersion,
};
