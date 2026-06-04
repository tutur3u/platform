const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readWorkflowJobBlock,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

const PACKAGE_PROVENANCE_REPOSITORY_URL = 'https://github.com/tutur3u/platform';

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

test('Platform Vercel workflows build local devbox dependency before Vercel build', () => {
  for (const workflowName of [
    'vercel-preview-platform.yaml',
    'vercel-production-platform.yaml',
  ]) {
    const deployJob = readWorkflowJobBlock(
      workflowName,
      workflowName.startsWith('vercel-preview-')
        ? 'Deploy-Preview'
        : 'Deploy-Production'
    );
    const dependencyBuildIndex = deployJob.indexOf(
      'Build workspace dependencies'
    );
    const vercelBuildIndex = deployJob.indexOf('Build Project Artifacts');

    assert.notEqual(dependencyBuildIndex, -1);
    assert.notEqual(vercelBuildIndex, -1);
    assert.ok(
      dependencyBuildIndex < vercelBuildIndex,
      `${workflowName} must build workspace dependencies before Vercel build`
    );
    assert.match(deployJob, /--filter=@tuturuuu\/devbox/);
  }
});

test('Platform production deployment waits for release package visibility', () => {
  const deployJob = readWorkflowJobBlock(
    'vercel-production-platform.yaml',
    'Deploy-Production'
  );
  const releaseGateIndex = deployJob.indexOf('Wait for package release gate');
  const installIndex = deployJob.indexOf('Install dependencies');
  const vercelBuildIndex = deployJob.indexOf('Build Project Artifacts');

  assert.notEqual(releaseGateIndex, -1);
  assert.notEqual(installIndex, -1);
  assert.notEqual(vercelBuildIndex, -1);
  assert.ok(
    releaseGateIndex < installIndex,
    'platform production deploy must wait for package releases before installing dependencies'
  );
  assert.ok(
    releaseGateIndex < vercelBuildIndex,
    'platform production deploy must wait for package releases before Vercel build'
  );
  assert.match(
    deployJob,
    /node scripts\/ci\/package-release-readiness\.js wait-changed-package-versions/
  );
  assert.match(deployJob, /actions:\s*read/);
  assert.match(deployJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
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

test('Release Please workflow is production-scoped and prefers bot token', () => {
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
  assert.match(
    releaseJob,
    /token: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \|\| github\.token \}\}/
  );
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
  assert.equal(manifest['.'], '0.3.0');
  assert.equal(manifest['apps/mobile'], '0.5.1');
  assert.equal(manifest['packages/sdk'], '0.5.0');
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
  const portlessIndex = e2eJob.indexOf('Start Portless shared localhost proxy');
  const runIndex = e2eJob.indexOf('Run Playwright shard');
  const diagnosticsIndex = e2eJob.indexOf('Collect Dockerized E2E diagnostics');
  const restoreIndex = e2eJob.indexOf('Restore cached Docker images');
  const loadIndex = e2eJob.indexOf('Load cached Docker images');
  const diagnosticsUploadIndex = e2eJob.indexOf('Upload E2E diagnostics');
  const uploadIndex = e2eJob.indexOf('Upload Playwright report');

  assert.match(
    workflow,
    /\n {2}push:\n {4}branches-ignore:\n {6}- production\n/
  );
  assert.match(
    e2eJob,
    /BASE_URL: https:\/\/tuturuuu\.localhost/u,
    'E2E must exercise the shared-cookie localhost domain, not plain localhost'
  );
  assert.match(e2eJob, /github\.ref != 'refs\/heads\/production'/);
  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(portlessIndex, -1);
  assert.notEqual(runIndex, -1);
  assert.notEqual(diagnosticsIndex, -1);
  assert.notEqual(restoreIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.notEqual(diagnosticsUploadIndex, -1);
  assert.notEqual(uploadIndex, -1);
  assert.match(e2eJob, /bunx portless proxy start --wildcard/u);
  assert.doesNotMatch(
    e2eJob,
    /bunx portless alias tuturuuu 7803/u,
    'Docker E2E runner must refresh the Portless alias after Docker is healthy'
  );
  assert.match(
    e2eJob,
    /tee \.\.\/\.\.\/tmp\/e2e-diagnostics\/run-playwright-shard\.log/u
  );
  assert.ok(
    cleanupIndex < restoreIndex,
    'runner disk cleanup must happen before restoring Supabase Docker images'
  );
  assert.ok(
    cleanupIndex < loadIndex,
    'runner disk cleanup must happen before loading Supabase Docker images'
  );
  assert.ok(
    portlessIndex < runIndex,
    'shared localhost proxy must start before Playwright uses BASE_URL'
  );
  assert.ok(
    runIndex < diagnosticsIndex,
    'E2E diagnostics must run after the shard command can fail'
  );
  assert.ok(
    diagnosticsIndex < uploadIndex,
    'E2E diagnostics must print before artifact upload/cleanup steps'
  );
  assert.ok(
    diagnosticsIndex < diagnosticsUploadIndex,
    'E2E diagnostics must be collected before uploading the diagnostics artifact'
  );
  assert.ok(
    diagnosticsUploadIndex < uploadIndex,
    'E2E diagnostics artifact should upload before Playwright-only artifacts'
  );
  assert.match(e2eJob, /docker system prune -af --volumes/u);
  assert.match(e2eJob, /\/usr\/share\/dotnet/u);
  assert.match(e2eJob, /\/usr\/local\/lib\/android/u);
  assert.match(e2eJob, /\/opt\/hostedtoolcache\/CodeQL/u);
  assert.match(e2eJob, /if: \$\{\{ failure\(\) \}\}/u);
  assert.match(
    e2eJob,
    /docker ps -a --filter "label=com\.docker\.compose\.project=\$\{DOCKER_WEB_COMPOSE_PROJECT_NAME\}"/u
  );
  assert.match(
    e2eJob,
    /docker compose --env-file tmp\/e2e\/web\.env -f docker-compose\.web\.prod\.yml -p "\$\{DOCKER_WEB_COMPOSE_PROJECT_NAME\}" ps -a/u
  );
  assert.match(
    e2eJob,
    /docker compose --env-file tmp\/e2e\/web\.env -f docker-compose\.web\.prod\.yml -p "\$\{DOCKER_WEB_COMPOSE_PROJECT_NAME\}" logs --tail=1000/u
  );
  assert.match(
    e2eJob,
    /curl -k -i --max-time 10 https:\/\/tuturuuu\.localhost\/login > "\$diagnostics_dir\/portless-login\.txt"/u
  );
  assert.match(e2eJob, /apps\/web\/test-results\/\.last-run\.json/u);
  assert.match(
    e2eJob,
    /name: e2e-diagnostics-\$\{\{ matrix\.shard \}\}-of-\$\{\{ matrix\.total_shards \}\}/u
  );
  assert.match(e2eJob, /path: tmp\/e2e-diagnostics\//u);
  assert.match(e2eJob, /if-no-files-found: warn/u);
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

const packageReleaseWorkflows = [
  {
    artifactDir: 'ai-package',
    artifactName: 'tuturuuu-ai-npm-package',
    environment: 'ai-release-production',
    packageName: '@tuturuuu/ai',
    packagePath: 'packages/ai',
    rejectMessagePattern:
      /@tuturuuu\/ai releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/ai/,
      /run: bun run test/,
    ],
    workflowName: 'release-ai-package.yaml',
  },
  {
    artifactDir: 'devbox-package',
    artifactName: 'tuturuuu-devbox-npm-package',
    environment: 'devbox-release-production',
    packageName: '@tuturuuu/devbox',
    packagePath: 'packages/devbox',
    rejectMessagePattern:
      /@tuturuuu\/devbox releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/devbox/,
      /run: bun run build/,
      /run: bun run test/,
    ],
    workflowName: 'release-devbox-package.yaml',
  },
  {
    artifactDir: 'internal-api-package',
    artifactName: 'tuturuuu-internal-api-npm-package',
    environment: 'internal-api-release-production',
    packageName: '@tuturuuu/internal-api',
    packagePath: 'packages/internal-api',
    rejectMessagePattern:
      /@tuturuuu\/internal-api releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /working-directory: packages\/internal-api/,
      /run: bun run build/,
      /run: bun run test/,
    ],
    workflowName: 'release-internal-api-package.yaml',
  },
  {
    artifactDir: 'supabase-package',
    artifactName: 'tuturuuu-supabase-npm-package',
    environment: 'supabase-release-production',
    packageName: '@tuturuuu/supabase',
    packagePath: 'packages/supabase',
    rejectMessagePattern:
      /@tuturuuu\/supabase releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /working-directory: packages\/supabase/,
      /run: bun run test/,
    ],
    workflowName: 'release-supabase-package.yaml',
  },
  {
    artifactDir: 'types-package',
    artifactName: 'tuturuuu-types-npm-package',
    environment: 'types-release-production',
    packageName: '@tuturuuu/types',
    packagePath: 'packages/types',
    rejectMessagePattern:
      /@tuturuuu\/types releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/types/,
      /run: bun run build/,
    ],
    workflowName: 'release-types-package.yaml',
  },
  {
    artifactDir: 'typescript-config-package',
    artifactName: 'tuturuuu-typescript-config-npm-package',
    environment: 'typescript-config-release-production',
    packageName: '@tuturuuu/typescript-config',
    packagePath: 'packages/typescript-config',
    rejectMessagePattern:
      /@tuturuuu\/typescript-config releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/typescript-config/,
      /Validate package metadata/,
    ],
    workflowName: 'release-typescript-config-package.yaml',
  },
  {
    artifactDir: 'ui-package',
    artifactName: 'tuturuuu-ui-npm-package',
    environment: 'ui-release-production',
    packageName: '@tuturuuu/ui',
    packagePath: 'packages/ui',
    rejectMessagePattern:
      /@tuturuuu\/ui releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /bun run --filter @tuturuuu\/supabase build/,
      /working-directory: packages\/ui/,
      /run: bun run test/,
    ],
    workflowName: 'release-ui-package.yaml',
  },
  {
    artifactDir: 'sdk-package',
    artifactName: 'tuturuuu-sdk-npm-package',
    environment: 'sdk-release-production',
    packageName: 'tuturuuu',
    packagePath: 'packages/sdk',
    rejectMessagePattern:
      /SDK releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /Build SDK workspace dependencies/,
      /bun run --filter @tuturuuu\/devbox build/,
      /bun run --filter @tuturuuu\/types build/,
      /bun run --filter @tuturuuu\/internal-api build/,
      /working-directory: packages\/sdk/,
      /run: bun run test/,
    ],
    workflowName: 'release-sdk-package.yaml',
  },
];

test('package publish manifests expose provenance-compatible repository metadata', () => {
  for (const {
    packageName,
    packagePath,
    workflowName,
  } of packageReleaseWorkflows) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, packagePath, 'package.json'), 'utf8')
    );

    assert.equal(packageJson.name, packageName);
    assert.deepEqual(
      packageJson.repository,
      {
        directory: packagePath,
        type: 'git',
        url: PACKAGE_PROVENANCE_REPOSITORY_URL,
      },
      `${packagePath}/package.json repository metadata must match npm provenance for ${workflowName}`
    );
  }
});

test('package publish workflows release from production version bumps', () => {
  for (const {
    packagePath,
    rejectMessagePattern,
    workflowName,
  } of packageReleaseWorkflows) {
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
    const buildJob = readWorkflowJobBlock(workflowName, 'build');
    const prepareJob = readWorkflowJobBlock(
      workflowName,
      'prepare-publish-npm'
    );
    const publishJob = readWorkflowJobBlock(workflowName, 'publish-npm');

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
    assert.doesNotMatch(workflow, /\bbun publish\b/);
    assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/);
    assert.doesNotMatch(workflow, /secrets\.NPM_TOKEN/);
    assert.match(workflow, /publish-npm:/);
    assert.match(workflow, /registry-url: "https:\/\/registry\.npmjs\.org"/);

    assert.match(rejectJob, /if: github\.ref != 'refs\/heads\/production'/);
    assert.match(rejectJob, /permissions:\s*\{\}/);
    assert.match(rejectJob, rejectMessagePattern);
    assert.match(checkCiJob, /if: github\.ref == 'refs\/heads\/production'/);
    assert.match(
      checkVersionBumpJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/
    );
    assert.match(
      buildJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.check-version-bump\.outputs\.should_release == 'true'/
    );
    assert.match(prepareJob, /if: github\.ref == 'refs\/heads\/production'/);
    assert.match(prepareJob, /actions:\s*read/);
    assert.match(prepareJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(
      prepareJob,
      /npm view "\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}" version/
    );
    const dependencyWaitIndex = prepareJob.indexOf(
      `node scripts/ci/package-release-readiness.js wait-workspace-dependencies ${packagePath}`
    );
    assert.match(prepareJob, /npm pack --pack-destination/);
    const prepareManifestIndex = prepareJob.indexOf(
      `node scripts/ci/prepare-npm-package-manifest.js ${packagePath}`
    );
    const packIndex = prepareJob.indexOf('npm pack --pack-destination');

    assert.notEqual(
      dependencyWaitIndex,
      -1,
      `${workflowName} must wait for publishable workspace dependencies before packing`
    );
    assert.notEqual(
      prepareManifestIndex,
      -1,
      `${workflowName} must prepare npm package manifests before packing`
    );
    assert.ok(
      dependencyWaitIndex < prepareManifestIndex,
      `${workflowName} must wait for npm workspace dependencies before rewriting the publish manifest`
    );
    assert.ok(
      prepareManifestIndex < packIndex,
      `${workflowName} must rewrite workspace protocol dependencies before npm pack`
    );
    assert.match(prepareJob, /actions\/upload-artifact@/);
    assert.doesNotMatch(prepareJob, /id-token:\s*write/);
    assert.match(
      publishJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.prepare-publish-npm\.outputs\.should_publish == 'true'/
    );
  }
});

test('package trusted publishing keeps OIDC isolated to artifact publish jobs', () => {
  for (const {
    artifactDir,
    artifactName,
    environment,
    requiredBuildPatterns,
    workflowName,
  } of packageReleaseWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const buildJob = readWorkflowJobBlock(workflowName, 'build');
    const prepareJob = readWorkflowJobBlock(
      workflowName,
      'prepare-publish-npm'
    );
    const publishJob = readWorkflowJobBlock(workflowName, 'publish-npm');

    assert.doesNotMatch(workflow, /github\.event\.pull_request/);
    assert.doesNotMatch(workflow, /pull_request\.title/);

    for (const pattern of requiredBuildPatterns) {
      assert.match(buildJob, pattern);
    }

    assert.match(
      prepareJob,
      /package_name: \$\{\{ steps\.version-check\.outputs\.package_name \}\}/
    );
    assert.match(
      prepareJob,
      /package_version: \$\{\{ steps\.version-check\.outputs\.package_version \}\}/
    );
    assert.match(
      prepareJob,
      /should_publish: \$\{\{ steps\.version-check\.outputs\.should_publish \}\}/
    );
    assert.match(prepareJob, new RegExp(`name: ${artifactName}`));
    assert.match(prepareJob, /path: \$\{\{ runner\.temp \}\}\/.+\/\*\.tgz/);
    assert.match(
      prepareJob,
      /steps\.version-check\.outputs\.should_publish == 'true'/
    );
    assert.doesNotMatch(prepareJob, /id-token:\s*write/);

    assert.match(publishJob, new RegExp(`environment: ${environment}`));
    assert.match(publishJob, /id-token:\s*write/);
    assert.match(publishJob, /actions\/download-artifact@/);
    assert.match(publishJob, new RegExp(`name: ${artifactName}`));
    assert.match(publishJob, new RegExp(`path: ${artifactDir}`));
    assert.match(publishJob, /Check npm trusted publishing support/);
    assert.match(publishJob, /Verify package artifact/);
    assert.match(
      publishJob,
      /echo "path=\.\/\$\{PACKAGE_TARBALL\}" >> "\$GITHUB_OUTPUT"/
    );
    assert.match(
      publishJob,
      /npm publish "\$\{\{ steps\.artifact\.outputs\.path \}\}" --ignore-scripts/
    );
    assert.match(publishJob, /trusted publisher is configured/);
    assert.match(publishJob, /Wait for npm publication/);
    assert.match(
      publishJob,
      /npm view "\$\{EXPECTED_PACKAGE_NAME\}@\$\{EXPECTED_PACKAGE_VERSION\}" version --registry https:\/\/registry\.npmjs\.org/
    );
    assert.match(publishJob, /was published but did not become visible on npm/);
    assert.doesNotMatch(publishJob, /actions\/checkout@/);
    assert.doesNotMatch(publishJob, /setup-bun/);
    assert.doesNotMatch(publishJob, /\bbun install\b/);
    assert.doesNotMatch(publishJob, /\bnpm install\b/);
    assert.doesNotMatch(publishJob, /package-release-readiness\.js/);
    assert.doesNotMatch(publishJob, /\bsecrets\./);
    assert.doesNotMatch(publishJob, /NODE_AUTH_TOKEN/);
  }
});
