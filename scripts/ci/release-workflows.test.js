const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readWorkflowJobBlock,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

test('Vercel workflows grant marker permissions and record successful runs', () => {
  for (const workflowName of vercelWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const checkCiJob = readWorkflowJobBlock(workflowName, 'check-ci');
    const deployJob = readWorkflowJobBlock(
      workflowName,
      workflowName.startsWith('vercel-preview-')
        ? 'Deploy-Preview'
        : 'Deploy-Production'
    );

    assert.match(checkCiJob, /deployments:\s*read/);
    assert.match(deployJob, /deployments:\s*write/);
    assert.match(workflow, /Record successful Vercel deployment marker/);
    assert.match(workflow, new RegExp(`VERCEL_WORKFLOW_NAME: ${workflowName}`));
    assert.match(
      workflow,
      /bun run --silent scripts\/ci\/record-vercel-deployment\.ts/
    );
  }
});

test('Vercel workflows generate shared build metadata before building', () => {
  for (const workflowName of vercelWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const buildMetadataIndex = workflow.indexOf(
      'Generate shared build metadata'
    );
    const buildProjectIndex = workflow.indexOf('Build Project Artifacts');

    assert.notEqual(
      buildMetadataIndex,
      -1,
      `${workflowName} must generate shared build metadata`
    );
    assert.notEqual(
      buildProjectIndex,
      -1,
      `${workflowName} must build project artifacts`
    );
    assert.ok(
      buildMetadataIndex < buildProjectIndex,
      `${workflowName} must generate shared build metadata before Vercel build`
    );
    assert.match(
      workflow,
      /bun run --silent scripts\/ci\/generate-build-metadata\.ts/
    );
  }
});

test('mail deployment workflows do not persist checkout credentials', () => {
  for (const workflowName of [
    'vercel-preview-mail.yaml',
    'vercel-production-mail.yaml',
  ]) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const jobName = workflowName.startsWith('vercel-preview-')
      ? 'Deploy-Preview'
      : 'Deploy-Production';
    const deployJob = readWorkflowJobBlock(workflowName, jobName);

    assert.match(
      deployJob,
      /persist-credentials:\s*false/,
      `${workflowName} must not leave the GitHub token in local Git config`
    );
    assert.doesNotMatch(
      deployJob,
      /persist-credentials:\s*true/,
      `${workflowName} must not persist checkout credentials`
    );
    assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  }
});

test('CI workflows use main instead of retired staging branch filters', () => {
  const workflowsWithoutStagingBranchFilters = [
    'branch-name-check.yaml',
    'codeql.yml',
    'docker-setup-check.yaml',
    'supabase-production.yaml',
    'supabase-staging.yaml',
  ];

  for (const workflowName of workflowsWithoutStagingBranchFilters) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );

    assert.doesNotMatch(
      workflow,
      /^\s*-\s*staging\s*$/m,
      `${workflowName} must not list staging as a Git branch`
    );
    assert.doesNotMatch(
      workflow,
      /branches:\s*\[[^\]]*\bstaging\b[^\]]*\]/,
      `${workflowName} must not include staging in inline branch filters`
    );
  }

  const supabaseStagingWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-staging.yaml'),
    'utf8'
  );
  const supabaseProductionWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-production.yaml'),
    'utf8'
  );

  assert.match(supabaseStagingWorkflow, /\n {4}branches:\n {6}- main\n/);
  assert.match(
    supabaseProductionWorkflow,
    /supabase-staging\.yaml\/runs\?branch=main&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.doesNotMatch(supabaseProductionWorkflow, /runs\?branch=staging/);
});

test('Supabase staging migration includes every local migration when pushing', () => {
  const deployJob = readWorkflowJobBlock('supabase-staging.yaml', 'deploy');

  assert.match(deployJob, /supabase db push --include-all/);
});

test('branch name check allows release-please generated branches', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'branch-name-check.yaml'),
    'utf8'
  );

  assert.match(workflow, /\^release-please--branches--\.\+/);
});

test('Release Please workflow is production-scoped and uses bot token', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'release-please.yaml'),
    'utf8'
  );
  const rejectJob = readWorkflowJobBlock(
    'release-please.yaml',
    'reject-non-production-ref'
  );
  const checkCiJob = readWorkflowJobBlock('release-please.yaml', 'check-ci');
  const releaseJob = readWorkflowJobBlock(
    'release-please.yaml',
    'release-please'
  );

  assert.match(workflow, /\n {2}push:\n {4}branches:\s*\[production\]/);
  assert.match(workflow, /\n {2}workflow_dispatch:\n/);
  assert.match(rejectJob, /if: github\.ref != 'refs\/heads\/production'/);
  assert.match(rejectJob, /permissions:\s*\{\}/);
  assert.match(
    rejectJob,
    /Release Please can only run from refs\/heads\/production/
  );
  assert.match(checkCiJob, /if: github\.ref == 'refs\/heads\/production'/);
  assert.match(checkCiJob, /workflow_name: release-please\.yaml/);
  assert.match(
    releaseJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/
  );
  assert.match(releaseJob, /contents:\s*write/);
  assert.match(releaseJob, /issues:\s*write/);
  assert.match(releaseJob, /pull-requests:\s*write/);
  assert.match(releaseJob, /uses: googleapis\/release-please-action@v5/);
  assert.match(releaseJob, /token: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \}\}/);
  assert.match(releaseJob, /target-branch: production/);
  assert.match(releaseJob, /config-file: release-please-config\.json/);
  assert.match(releaseJob, /manifest-file: \.release-please-manifest\.json/);
  assert.doesNotMatch(releaseJob, /secrets\.GITHUB_TOKEN/);
});

test('Release Please manifest tracks platform and workspace releases safely', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'release-please-config.json'), 'utf8')
  );
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, '.release-please-manifest.json'),
      'utf8'
    )
  );
  const workspacePaths = ['apps', 'packages']
    .flatMap((workspaceDir) =>
      fs
        .readdirSync(path.join(repoRoot, workspaceDir), {
          withFileTypes: true,
        })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => `${workspaceDir}/${dirent.name}`)
    )
    .filter((workspacePath) =>
      fs.existsSync(path.join(repoRoot, workspacePath, 'package.json'))
    )
    .sort();
  const workspaceVersions = new Map(
    workspacePaths.map((workspacePath) => {
      const packageJson = JSON.parse(
        fs.readFileSync(
          path.join(repoRoot, workspacePath, 'package.json'),
          'utf8'
        )
      );

      return [workspacePath, packageJson.version];
    })
  );
  const expectedReleasePaths = workspacePaths
    .filter((workspacePath) => {
      if (workspacePath === 'apps/web') return false;
      if (workspacePath === 'apps/mobile') return true;

      return Boolean(workspaceVersions.get(workspacePath));
    })
    .sort();
  const configuredReleasePaths = Object.keys(config.packages)
    .filter((workspacePath) => workspacePath !== '.')
    .sort();

  assert.equal(
    config['bootstrap-sha'],
    'c5a2f5935cfd8a814a8946742cdea404ba609f23'
  );
  assert.equal(config['always-update'], true);
  assert.equal(config['separate-pull-requests'], false);
  assert.equal(config['include-component-in-tag'], true);
  assert.equal(config.plugins, undefined);
  assert.equal(config.packages['.'].component, 'platform');
  assert.equal(config.packages['.']['release-type'], 'simple');
  assert.equal(config.packages['.']['version-file'], 'platform-version.txt');
  assert.deepEqual(
    config.packages['.']['extra-files'].map((entry) => entry.path).sort(),
    [
      'packages/utils/src/platform-release.test.ts',
      'packages/utils/src/platform-release.ts',
    ]
  );
  assert.equal(config.packages['apps/mobile']['release-type'], 'dart');
  assert.equal(config.packages['apps/web'], undefined);
  assert.equal(manifest['.'], '0.1.159');
  assert.equal(manifest['apps/mobile'], '0.5.0');
  assert.equal(manifest['packages/sdk'], '0.4.9');
  assert.deepEqual(configuredReleasePaths, expectedReleasePaths);

  for (const [workspacePath, version] of workspaceVersions) {
    if (workspacePath === 'apps/mobile') {
      const pubspec = fs.readFileSync(
        path.join(repoRoot, workspacePath, 'pubspec.yaml'),
        'utf8'
      );
      const mobileVersion = pubspec.match(
        /^version:\s*([0-9]+\.[0-9]+\.[0-9]+)(?:\+\d+)?$/m
      );

      assert.ok(mobileVersion);
      assert.equal(manifest[workspacePath], mobileVersion[1]);
      continue;
    }

    if (workspacePath === 'apps/web' || !version) {
      assert.equal(config.packages[workspacePath], undefined);
      assert.equal(manifest[workspacePath], undefined);
      continue;
    }

    assert.equal(manifest[workspacePath], version);
  }

  for (const [workspacePath, packageConfig] of Object.entries(
    config.packages
  )) {
    const extraFiles = packageConfig['extra-files'] ?? [];
    assert.ok(
      extraFiles.every((entry) => entry.path !== 'jsr.json'),
      `${workspacePath} must not update JSR package metadata while package releases are npm-only`
    );
  }
});

test('E2E workflow frees runner disk before loading cached Docker images', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );
  const e2eJob = readWorkflowJobBlock('e2e-tests.yaml', 'e2e');
  const cleanupIndex = e2eJob.indexOf('Free runner disk for Dockerized E2E');
  const restoreIndex = e2eJob.indexOf('Restore cached Docker images');
  const loadIndex = e2eJob.indexOf('Load cached Docker images');

  assert.match(
    workflow,
    /\n {2}push:\n {4}branches-ignore:\n {6}- production\n/
  );
  assert.match(e2eJob, /github\.ref != 'refs\/heads\/production'/);
  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(restoreIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.ok(
    cleanupIndex < restoreIndex,
    'runner disk cleanup must happen before restoring Supabase Docker images'
  );
  assert.ok(
    cleanupIndex < loadIndex,
    'runner disk cleanup must happen before loading Supabase Docker images'
  );
  assert.match(e2eJob, /docker system prune -af --volumes/u);
  assert.match(e2eJob, /\/usr\/share\/dotnet/u);
  assert.match(e2eJob, /\/usr\/local\/lib\/android/u);
  assert.match(e2eJob, /\/opt\/hostedtoolcache\/CodeQL/u);
});

test('Supabase production migration requires production deployment and successful staged SHA', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-production.yaml'),
    'utf8'
  );
  const evaluateJob = readWorkflowJobBlock(
    'supabase-production.yaml',
    'evaluate-prerequisites'
  );
  const deployJob = readWorkflowJobBlock('supabase-production.yaml', 'deploy');

  assert.match(
    workflow,
    /workflows:\n {6}- "Vercel Platform Production Deployment"\n {6}- "Supabase Staging Migration"\n/
  );
  assert.match(workflow, /\n {4}branches:\n {6}- production\n/);
  assert.match(workflow, /\n {6}- main\n/);

  assert.match(
    evaluateJob,
    /manual dispatches must run from the production branch/
  );
  assert.match(
    evaluateJob,
    /TRIGGER_WORKFLOW" = "Vercel Platform Production Deployment"/
  );
  assert.match(evaluateJob, /TRIGGER_WORKFLOW" = "Supabase Staging Migration"/);
  assert.match(
    evaluateJob,
    /production deployment trigger ran on '\$TRIGGER_BRANCH' instead of production/
  );
  assert.match(
    evaluateJob,
    /staging migration trigger ran on '\$TRIGGER_BRANCH' instead of main/
  );
  assert.match(
    evaluateJob,
    /Staging migration completed\. Re-checking production migration prerequisites for \$TARGET_SHA/
  );
  assert.match(
    evaluateJob,
    /vercel-production-platform\.yaml\/runs\?branch=production&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.match(evaluateJob, /VERCEL_SHA" != "\$TARGET_SHA"/);
  assert.match(
    evaluateJob,
    /supabase-staging\.yaml\/runs\?branch=main&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.match(evaluateJob, /STAGING_SHA" != "\$TARGET_SHA"/);
  assert.match(evaluateJob, /STAGING_STATUS" != "completed"/);
  assert.match(evaluateJob, /STAGING_CONCLUSION" != "success"/);
  assert.doesNotMatch(
    evaluateJob,
    /STAGING_CONCLUSION" = "skipped"/,
    'production migration must not accept skipped staging migration runs'
  );
  assert.match(
    evaluateJob,
    /Production deployment and staging migration are bound to \$TARGET_SHA/
  );

  assert.match(
    deployJob,
    /ref: \$\{\{ needs\.evaluate-prerequisites\.outputs\.target_sha \}\}/
  );
});

test('environment-scoped Vercel workflows scope deploy secrets to deploy jobs', () => {
  const projectSecretsByApp = {
    apps: 'VERCEL_APPS_PROJECT_ID',
    calendar: 'VERCEL_CALENDAR_PROJECT_ID',
    chat: 'VERCEL_CHAT_PROJECT_ID',
    cms: 'VERCEL_CMS_PROJECT_ID',
    drive: 'VERCEL_DRIVE_PROJECT_ID',
    finance: 'VERCEL_FINANCE_PROJECT_ID',
    inventory: 'VERCEL_INVENTORY_PROJECT_ID',
    learn: 'VERCEL_LEARN_PROJECT_ID',
    mail: 'VERCEL_MAIL_PROJECT_ID',
    meet: 'VERCEL_TUMEET_PROJECT_ID',
    mind: 'VERCEL_MIND_PROJECT_ID',
    nova: 'VERCEL_NOVA_PROJECT_ID',
    platform: 'VERCEL_PLATFORM_PROJECT_ID',
    qr: 'VERCEL_QR_PROJECT_ID',
    rewise: 'VERCEL_REWISE_PROJECT_ID',
    shortener: 'VERCEL_SHORTENER_PROJECT_ID',
    tasks: 'VERCEL_TUDO_PROJECT_ID',
    teach: 'VERCEL_TEACH_PROJECT_ID',
    track: 'VERCEL_TRACK_PROJECT_ID',
  };
  const forbiddenWorkflowSecrets = [
    'ENCRYPTION_MASTER_KEY',
    'GOOGLE_VERTEX_LOCATION',
    'GOOGLE_VERTEX_PROJECT',
    'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
    'PRODUCTION_SUPABASE_SECRET_KEY',
    'PRODUCTION_SUPABASE_URL',
    'TURBO_TEAM',
    'TURBO_TOKEN',
  ];

  for (const workflowName of vercelWorkflows) {
    const match = workflowName.match(
      /^vercel-(preview|production)-(.+)\.yaml$/
    );
    assert.ok(
      match,
      `${workflowName} must follow the Vercel workflow naming convention`
    );

    const [, target, app] = match;
    const isPreview = target === 'preview';
    const jobName = isPreview ? 'Deploy-Preview' : 'Deploy-Production';
    const expectedEnvironment = `vercel-${target}-${app}`;
    const expectedRefGuard = isPreview
      ? /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/
      : /github\.ref == 'refs\/heads\/production'/;
    const projectSecret = projectSecretsByApp[app];

    assert.ok(
      projectSecret,
      `${workflowName} must declare an expected project secret`
    );

    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const header = workflow.slice(0, workflow.indexOf('\njobs:'));
    const deployJob = readWorkflowJobBlock(workflowName, jobName);
    const installIndex = workflow.indexOf('run: bun install\n');
    const firstSecretIndex = workflow.indexOf('secrets.');

    assert.doesNotMatch(
      header,
      /^env:/m,
      `${workflowName} must not define workflow-scope environment variables`
    );
    assert.doesNotMatch(
      header,
      /\bsecrets\./,
      `${workflowName} must not expose GitHub secrets at workflow scope`
    );
    assert.match(header, /\npermissions:\n {2}contents: read\n/);
    assert.match(deployJob, expectedRefGuard);
    assert.match(deployJob, new RegExp(`environment: ${expectedEnvironment}`));

    if (isPreview) {
      assert.doesNotMatch(
        header,
        /\n {2}push:/,
        `${workflowName} must not expose deployment secrets to branch push workflows`
      );
      assert.match(header, /\n {2}workflow_dispatch:\n/);
      assert.match(header, /\n {6}preview_ref:\n/);
      assert.match(
        deployJob,
        /vars\.TRUSTED_PREVIEW_DEPLOY_ACTORS/,
        `${workflowName} must require a trusted manual preview deploy actor`
      );
      assert.match(
        deployJob,
        /ref: \$\{\{ inputs\.preview_ref \}\}/,
        `${workflowName} must check out the manually approved preview ref`
      );
    }

    assert.doesNotMatch(
      workflow.slice(0, installIndex),
      /\bsecrets\./,
      `${workflowName} must not expose secrets before dependency install runs`
    );
    assert.ok(
      installIndex > -1 && installIndex < firstSecretIndex,
      `${workflowName} must install dependencies before deployment secrets are introduced`
    );
    assert.match(
      deployJob,
      /VERCEL_ORG_ID: \$\{\{ secrets\.VERCEL_ORG_ID \}\}/
    );
    assert.match(
      deployJob,
      new RegExp(
        `VERCEL_PROJECT_ID: \\$\\{\\{ secrets\\.${projectSecret} \\}\\}`
      )
    );

    for (const secretName of forbiddenWorkflowSecrets) {
      assert.doesNotMatch(
        workflow,
        new RegExp(`secrets\\.${secretName}`),
        `${workflowName} must read ${secretName} from the Vercel project environment, not GitHub Actions`
      );
    }
  }
});

test('legacy version bump generator workflows are retired', () => {
  for (const workflowName of [
    'check-and-bump-versions.yaml',
    'sdk-version-bump.yaml',
  ]) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );

    assert.match(workflow, /\n {2}workflow_dispatch:\n/);
    assert.match(workflow, /release-please\.yaml/);
    assert.match(workflow, /permissions:\s*\{\}/);
    assert.doesNotMatch(workflow, /\n {2}push:\n/);
    assert.doesNotMatch(workflow, /\n {2}pull_request:\n/);
    assert.doesNotMatch(workflow, /contents:\s*write/);
    assert.doesNotMatch(workflow, /pull-requests:\s*write/);
    assert.doesNotMatch(workflow, /peter-evans\/create-pull-request/);
    assert.doesNotMatch(workflow, /check-sdk-version-bump\.mjs/);
  }
});

test('package publish workflows release from production version bumps', () => {
  const packageWorkflows = [
    ['release-ai-package.yaml', 'packages/ai', '@tuturuuu/ai'],
    [
      'release-supabase-package.yaml',
      'packages/supabase',
      '@tuturuuu/supabase',
    ],
    ['release-types-package.yaml', 'packages/types', '@tuturuuu/types'],
    [
      'release-typescript-config-package.yaml',
      'packages/typescript-config',
      '@tuturuuu/typescript-config',
    ],
    ['release-ui-package.yaml', 'packages/ui', '@tuturuuu/ui'],
  ];

  for (const [workflowName, packagePath, packageName] of packageWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const rejectJob = readWorkflowJobBlock(
      workflowName,
      'reject-non-production-ref'
    );
    const checkCiJob = readWorkflowJobBlock(workflowName, 'check-ci');
    const checkVersionBumpJob = readWorkflowJobBlock(
      workflowName,
      'check-version-bump'
    );

    assert.match(workflow, /\n {2}push:\n {4}branches:\s*\[production\]/);
    assert.match(workflow, new RegExp(`"${packagePath}/package\\.json"`));
    assert.match(workflow, new RegExp(`"\\.github/workflows/${workflowName}"`));
    assert.doesNotMatch(workflow, /\n {2}pull_request:\n/);
    assert.doesNotMatch(workflow, /github\.event\.pull_request/);
    assert.doesNotMatch(workflow, /pull_request\.title/);
    assert.doesNotMatch(workflow, /jsr/);
    assert.doesNotMatch(workflow, /npm\.pkg\.github\.com/);
    assert.doesNotMatch(workflow, /publish-jsr/);
    assert.doesNotMatch(workflow, /publish-gpr/);
    assert.doesNotMatch(workflow, /bunx jsr publish/);
    assert.doesNotMatch(workflow, /bun publish --no-git-checks/);
    assert.match(workflow, /publish-npm:/);
    assert.match(workflow, /registry-url: "https:\/\/registry\.npmjs\.org"/);
    assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{secrets\.NPM_TOKEN\}\}/);

    assert.match(rejectJob, /if: github\.ref != 'refs\/heads\/production'/);
    assert.match(rejectJob, /permissions:\s*\{\}/);
    assert.match(
      rejectJob,
      new RegExp(
        `${packageName} releases can only run from refs/heads/production`
      )
    );
    assert.match(checkCiJob, /if: github\.ref == 'refs\/heads\/production'/);
    assert.match(
      checkVersionBumpJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/
    );
  }
});

test('SDK trusted publishing keeps OIDC isolated to artifact publish job', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'release-sdk-package.yaml'),
    'utf8'
  );
  const rejectJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'reject-non-production-ref'
  );
  const checkCiJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'check-ci'
  );
  const checkVersionBumpJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'check-version-bump'
  );
  const buildJob = readWorkflowJobBlock('release-sdk-package.yaml', 'build');
  const prepareJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'prepare-publish-npm'
  );
  const publishJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'publish-npm'
  );

  assert.match(workflow, /\n {2}push:\n/);
  assert.match(workflow, /branches:\s*\[production\]/);
  assert.match(workflow, /"packages\/sdk\/package\.json"/);
  assert.match(workflow, /"\.github\/workflows\/release-sdk-package\.yaml"/);
  assert.doesNotMatch(workflow, /\bsecrets\./);
  assert.doesNotMatch(workflow, /github\.event\.pull_request/);
  assert.doesNotMatch(workflow, /pull_request\.title/);

  assert.match(rejectJob, /if: github\.ref != 'refs\/heads\/production'/);
  assert.match(rejectJob, /permissions:\s*\{\}/);
  assert.match(
    rejectJob,
    /SDK releases can only run from refs\/heads\/production/
  );

  assert.match(checkCiJob, /if: github\.ref == 'refs\/heads\/production'/);
  assert.match(
    checkVersionBumpJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/
  );

  assert.match(
    buildJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.check-version-bump\.outputs\.should_release == 'true'/
  );
  assert.match(buildJob, /Build SDK workspace dependencies/);
  assert.match(buildJob, /bun run --filter @tuturuuu\/types build/);
  assert.match(buildJob, /bun run --filter @tuturuuu\/internal-api build/);
  assert.match(buildJob, /working-directory: packages\/sdk/);
  assert.match(buildJob, /run: bun run test/);

  assert.match(prepareJob, /if: github\.ref == 'refs\/heads\/production'/);
  assert.doesNotMatch(prepareJob, /id-token:\s*write/);
  assert.match(prepareJob, /Build SDK workspace dependencies/);
  assert.match(
    prepareJob,
    /steps\.version-check\.outputs\.should_publish == 'true'/
  );
  assert.match(prepareJob, /bun run --filter @tuturuuu\/types build/);
  assert.match(prepareJob, /bun run --filter @tuturuuu\/internal-api build/);
  assert.match(prepareJob, /npm pack --pack-destination/);
  assert.match(prepareJob, /actions\/upload-artifact@/);

  assert.match(
    publishJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.prepare-publish-npm\.outputs\.should_publish == 'true'/
  );
  assert.match(publishJob, /environment: sdk-release-production/);
  assert.match(publishJob, /id-token:\s*write/);
  assert.match(publishJob, /actions\/download-artifact@/);
  assert.match(publishJob, /Verify package artifact/);
  assert.match(
    publishJob,
    /echo "path=\.\/\$\{PACKAGE_TARBALL\}" >> "\$GITHUB_OUTPUT"/
  );
  assert.match(
    publishJob,
    /npm publish "\$\{\{ steps\.artifact\.outputs\.path \}\}" --ignore-scripts/
  );
  assert.doesNotMatch(publishJob, /actions\/checkout@/);
  assert.doesNotMatch(publishJob, /setup-bun/);
  assert.doesNotMatch(publishJob, /\bbun install\b/);
  assert.doesNotMatch(publishJob, /\bnpm install\b/);
});
