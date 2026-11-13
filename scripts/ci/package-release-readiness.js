const {
  getWorkspacePackages,
  getReleaseWorkflowFiles,
  getPublishableWorkspacePackages,
  getPackageInfo,
  getWorkspaceDependencies,
  getDependentWorkspacePackages,
} = require('./package-release-workspaces.js');
const {
  DEFAULT_GITHUB_API_URL,
  FAILED_WORKFLOW_CONCLUSIONS,
  getGitHubToken,
  buildWorkflowRunsUrl,
  buildWorkflowDispatchUrl,
  getRelatedWorkflowRunStatus,
  dispatchRelatedWorkflow,
} = require('./package-release-github.js');
const {
  getChangedFilesFromEventPayload,
  getBeforeRefFromEventPayload,
  getChangedFiles,
  getLatestCommitChangedFiles,
  getChangedPublishablePackages,
} = require('./package-release-changes.js');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_REGISTRY,
  packageVersionExists,
} = require('./package-release-registry.js');
const DEFAULT_WAIT_ATTEMPTS = 60;
const DEFAULT_WAIT_DELAY_MS = 10_000;
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

      // 'success' here means the related workflow concluded without publishing
      // (it deferred its own release). Nudge it the same way as a missing run so
      // the deferred dependency does not stall until the wait times out.
      if (
        (workflowStatus.state === 'missing' ||
          workflowStatus.state === 'success') &&
        !recoveryDispatchStarted
      ) {
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

    // A 'success' conclusion does not guarantee the dependency was published:
    // its release workflow may have deferred its own publish because its
    // dependencies were not ready yet. Treat success-but-missing like a missing
    // run and re-dispatch so the deferred dependency makes progress.
    if (
      workflowStatus.state === 'missing' ||
      workflowStatus.state === 'success'
    ) {
      await dispatchWorkflow({
        env,
        logger,
        workflowName: dependency.workflowName,
      });
      dependenciesReady = false;
      logger.log(
        `${packageName}@${packageVersion} deferred until ` +
          `${dependency.packageName}@${dependency.packageVersion} is published ` +
          `(re-dispatched ${dependency.workflowName}).`
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
    const result = await dispatchWorkflow({
      env,
      logger,
      skipDisabled: true,
      workflowName: dependent.workflowName,
    });
    if (result?.state !== 'disabled') dispatched.push(dependent);
  }

  return dispatched;
}

async function gateChangedPackageVersions({
  dispatchWorkflow = dispatchRelatedWorkflow,
  env = process.env,
  getRelatedWorkflowStatus = getRelatedWorkflowRunStatus,
  logger = console,
  registry = DEFAULT_REGISTRY,
  repoRoot,
  versionExists = packageVersionExists,
}) {
  const changedFiles = getLatestCommitChangedFiles({
    headRef: env.GITHUB_SHA || 'HEAD',
    repoRoot,
  });
  const changedPackages = getChangedPublishablePackages({
    changedFiles,
    repoRoot,
  });
  const pendingPackages = [];
  const checkedPackages = changedPackages.map((packageInfo) => ({
    packageName: packageInfo.packageJson.name,
    packageVersion: packageInfo.version,
    workflowName: packageInfo.workflowName,
  }));

  if (changedPackages.length === 0) {
    logger.log('No changed publishable package versions detected.');
    return {
      checked_packages: JSON.stringify([]),
      packages_ready: 'true',
      pending_packages: JSON.stringify([]),
    };
  }

  for (const packageInfo of changedPackages) {
    const packageName = packageInfo.packageJson.name;
    const packageVersion = packageInfo.version;

    if (
      versionExists({
        packageName,
        packageVersion,
        registry,
      })
    ) {
      logger.log(`${packageName}@${packageVersion} is visible on npm.`);
      continue;
    }

    const workflowStatus = await getRelatedWorkflowStatus({
      env,
      workflowName: packageInfo.workflowName,
    });

    if (workflowStatus.state === 'failed') {
      throw new Error(
        `${packageName}@${packageVersion} is blocked because ` +
          `${packageInfo.workflowName} failed for ${env.GITHUB_SHA}. ` +
          `Conclusion: ${workflowStatus.conclusion}. ` +
          `Run: ${workflowStatus.url ?? '(unavailable)'}`
      );
    }

    // A 'success' conclusion does not guarantee the package was published: the
    // release workflow may have deferred its own publish because its
    // dependencies were not ready. Treat success-but-missing like a missing run
    // and re-dispatch so the deferred release makes progress.
    if (
      workflowStatus.state === 'missing' ||
      workflowStatus.state === 'success'
    ) {
      await dispatchWorkflow({
        env,
        logger,
        workflowName: packageInfo.workflowName,
      });
      pendingPackages.push({
        packageName,
        packageVersion,
        state: 'dispatched',
        workflowName: packageInfo.workflowName,
      });
      logger.log(
        `Platform package gate deferred until ${packageName}@${packageVersion} ` +
          `is published (re-dispatched ${packageInfo.workflowName}).`
      );
      continue;
    }

    if (workflowStatus.state === 'pending') {
      pendingPackages.push({
        packageName,
        packageVersion,
        state: workflowStatus.status ?? 'pending',
        workflowName: packageInfo.workflowName,
      });
      logger.log(
        `Platform package gate deferred while ${packageInfo.workflowName} ` +
          `is ${workflowStatus.status ?? 'pending'}.`
      );
      continue;
    }

    throw new Error(
      `${packageName}@${packageVersion} readiness cannot be confirmed because ` +
        `${packageInfo.workflowName} status is unreadable.`
    );
  }

  if (pendingPackages.length === 0) {
    logger.log('Changed package versions are visible on npm.');
  } else {
    logger.log(
      'Changed package release gate deferred without occupying the platform build runner.'
    );
  }

  return {
    checked_packages: JSON.stringify(checkedPackages),
    packages_ready: pendingPackages.length === 0 ? 'true' : 'false',
    pending_packages: JSON.stringify(pendingPackages),
  };
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

  if (command === 'gate-changed-package-versions') {
    const outputs = await gateChangedPackageVersions({
      ...waitOptions,
      env,
      repoRoot,
    });
    appendGithubOutput(outputs, env);
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
      '<check-version|wait-version|gate-package-release|dispatch-dependent-workflows|wait-workspace-dependencies|gate-changed-package-versions|wait-changed-package-versions>'
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
  gateChangedPackageVersions,
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
