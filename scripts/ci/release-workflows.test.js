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
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const expectedBiomeCliVersion = rootPackageJson.devDependencies[
  '@biomejs/biome'
].replace(/^[^\d]*/u, '');
const expectedBiomeCliVersionPattern = expectedBiomeCliVersion.replaceAll(
  '.',
  '\\.'
);
const tanstackWebVercelWorkflows = new Set([
  'vercel-preview-tanstack-web.yaml',
  'vercel-production-tanstack-web.yaml',
]);

function getVercelRunJobName(workflowName) {
  const jobTarget = workflowName.startsWith('vercel-preview-')
    ? 'Preview'
    : 'Production';

  return tanstackWebVercelWorkflows.has(workflowName)
    ? `Build-${jobTarget}`
    : `Deploy-${jobTarget}`;
}

test('Vercel workflows grant marker permissions and record successful runs', () => {
  for (const workflowName of vercelWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const checkCiJob = readWorkflowJobBlock(workflowName, 'check-ci');
    const deployJob = readWorkflowJobBlock(
      workflowName,
      getVercelRunJobName(workflowName)
    );

    assert.match(checkCiJob, /deployments:\s*read/);
    assert.match(deployJob, /deployments:\s*write/);
    assert.match(workflow, new RegExp(`VERCEL_WORKFLOW_NAME: ${workflowName}`));

    if (workflowName === 'vercel-preview-platform.yaml') {
      assert.match(workflow, /Record successful Vercel build marker/);
      assert.match(workflow, /VERCEL_MARKER_KIND: build/);
      assert.match(
        workflow,
        /node --experimental-strip-types scripts\/ci\/record-vercel-deployment\.ts/
      );
    } else if (workflowName === 'vercel-production-platform.yaml') {
      assert.match(workflow, /Record successful Vercel build marker/);
      assert.match(workflow, /VERCEL_MARKER_KIND: build/);
      assert.match(workflow, /Record successful Vercel deployment marker/);
      assert.doesNotMatch(workflow, /VERCEL_MARKER_KIND: deployment/);
      assert.match(
        workflow,
        /node --experimental-strip-types scripts\/ci\/record-vercel-deployment\.ts/
      );
    } else if (tanstackWebVercelWorkflows.has(workflowName)) {
      assert.match(workflow, /Record successful Vercel build marker/);
      assert.match(workflow, /VERCEL_MARKER_KIND: build/);
      assert.doesNotMatch(
        workflow,
        /Record successful Vercel deployment marker/
      );
      assert.doesNotMatch(workflow, /\bvercel deploy\b/);
      assert.match(
        workflow,
        /bun run --silent scripts\/ci\/record-vercel-deployment\.ts/
      );
    } else {
      assert.match(workflow, /Record successful Vercel deployment marker/);
      assert.match(
        workflow,
        /bun run --silent scripts\/ci\/record-vercel-deployment\.ts/
      );
    }
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
    assert.match(
      workflow,
      /PLATFORM_BUILD_ENVIRONMENT: (?:preview|production)/
    );
    assert.match(workflow, /PLATFORM_BUILD_REF_NAME:/);
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/
    );
    assert.match(workflow, /NODE_OPTIONS: --max-old-space-size=8192/);
    assert.match(workflow, /TURBO_CONCURRENCY: "2"/);
    assert.doesNotMatch(workflow, /Build workspace dependencies/);
  }
});

test('Platform Vercel workflows rely on the checked-in full-app Turbo build', () => {
  const platformVercelConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps', 'web', 'vercel.json'), 'utf8')
  );

  assert.equal(
    platformVercelConfig.buildCommand,
    'cd ../.. && bun turbo:local run build --filter=@tuturuuu/web'
  );

  for (const workflowName of [
    'vercel-preview-platform.yaml',
    'vercel-production-platform.yaml',
  ]) {
    const deployJob = readWorkflowJobBlock(
      workflowName,
      getVercelRunJobName(workflowName)
    );
    const vercelBuildIndex = deployJob.indexOf('Build Project Artifacts');
    const installIndex = deployJob.indexOf('Install dependencies');

    assert.notEqual(installIndex, -1);
    assert.notEqual(vercelBuildIndex, -1);
    assert.doesNotMatch(deployJob, /Build workspace dependencies/);
    assert.match(
      deployJob,
      /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/
    );
    assert.match(deployJob, /command: vercel build/);

    if (workflowName === 'vercel-preview-platform.yaml') {
      const equivalentBuildIndex = deployJob.indexOf(
        'Check equivalent production platform build'
      );

      assert.notEqual(equivalentBuildIndex, -1);
      assert.ok(
        equivalentBuildIndex < installIndex,
        `${workflowName} must check same-SHA production build markers before installing dependencies`
      );
      assert.match(
        deployJob,
        /steps\.equivalent_build\.outputs\.found != 'true'/
      );
      assert.match(deployJob, /--marker-kind build/);
    } else {
      assert.doesNotMatch(deployJob, /Check equivalent preview platform build/);
      assert.doesNotMatch(deployJob, /steps\.equivalent_build/);
      assert.match(deployJob, /VERCEL_MARKER_KIND: build/);
    }
  }
});

test('Platform production build waits for release packages, deploys, and records markers', () => {
  const deployJob = readWorkflowJobBlock(
    'vercel-production-platform.yaml',
    'Deploy-Production'
  );
  const releaseGateIndex = deployJob.indexOf('Gate package release visibility');
  const installIndex = deployJob.indexOf('Install dependencies');
  const vercelBuildIndex = deployJob.indexOf('Build Project Artifacts');
  const vercelDeployIndex = deployJob.indexOf(
    'Deploy Project Artifacts to Vercel'
  );
  const buildMarkerIndex = deployJob.indexOf(
    'Record successful Vercel build marker'
  );
  const deploymentMarkerIndex = deployJob.indexOf(
    'Record successful Vercel deployment marker'
  );

  assert.notEqual(releaseGateIndex, -1);
  assert.notEqual(installIndex, -1);
  assert.notEqual(vercelBuildIndex, -1);
  assert.notEqual(vercelDeployIndex, -1);
  assert.notEqual(buildMarkerIndex, -1);
  assert.notEqual(deploymentMarkerIndex, -1);
  assert.ok(
    releaseGateIndex < installIndex,
    'platform production build must wait for package releases before installing dependencies'
  );
  assert.ok(
    releaseGateIndex < vercelBuildIndex,
    'platform production build must wait for package releases before Vercel build'
  );
  assert.ok(
    vercelBuildIndex < vercelDeployIndex,
    'platform production deploy must use artifacts built by Vercel build'
  );
  assert.ok(
    vercelDeployIndex < buildMarkerIndex,
    'platform production build marker must be recorded after Vercel deploy succeeds'
  );
  assert.ok(
    buildMarkerIndex < deploymentMarkerIndex,
    'platform production deployment marker must be recorded after the build marker'
  );
  assert.match(
    deployJob,
    /node scripts\/ci\/package-release-readiness\.js gate-changed-package-versions/
  );
  assert.match(deployJob, /id:\s*package_release_gate/);
  assert.match(deployJob, /packages_ready == 'false'/);
  assert.match(deployJob, /packages_ready == 'true'/);
  assert.doesNotMatch(deployJob, /TUTURUUU_NEXT_CACHE_COMPONENTS/);
  assert.match(deployJob, /actions:\s*write/);
  assert.match(deployJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    deployJob,
    /vercel deploy --archive=tgz --prebuilt --prod --token=\$\{\{ secrets\.VERCEL_TOKEN \}\}/
  );
  assert.match(deployJob, /VERCEL_MARKER_KIND: build/);
  assert.doesNotMatch(deployJob, /VERCEL_MARKER_KIND: deployment/);
  assert.doesNotMatch(deployJob, /Check equivalent preview platform build/);
  assert.doesNotMatch(deployJob, /steps\.equivalent_build/);
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
    const jobName = getVercelRunJobName(workflowName);
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
  assert.match(
    supabaseProductionWorkflow,
    /DEPLOYMENT_MARKER_HAS_SUCCESS=.*select\(\.state == "success"\).*length > 0/
  );
  assert.match(
    supabaseProductionWorkflow,
    /does not include a success status\. Latest state is/
  );
  assert.doesNotMatch(supabaseProductionWorkflow, /runs\?branch=staging/);
});

test('Codecov workflow runs workspace package tests with coverage', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'codecov.yaml'),
    'utf8'
  );
  const testJob = readWorkflowJobBlock('codecov.yaml', 'test');

  assert.match(
    testJob,
    /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/u
  );
  assert.match(
    testJob,
    /command: bash scripts\/ci\/run-with-backoff\.sh bun turbo:local run test --concurrency=4 -- --coverage/u
  );
  assert.match(testJob, /family: coverage/u);
  assert.match(testJob, /github\.event_name != 'pull_request'/u);
  assert.match(testJob, /github\.actor != 'dependabot\[bot\]'/u);
  assert.match(testJob, /CI_RETRY_MAX_ATTEMPTS: "2"/u);
  assert.doesNotMatch(testJob, /^\s+run:.*turbo:local run test/mu);
  assert.doesNotMatch(workflow, /run: bun vitest run --coverage/u);
});

test('Biome workflow runs pinned npm Biome CLI and prints captured output when checks fail', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'biome-check.yaml'),
    'utf8'
  );
  const formatJob = readWorkflowJobBlock('biome-check.yaml', 'format');
  const lintJob = readWorkflowJobBlock('biome-check.yaml', 'lint');
  const applyFormatJob = readWorkflowJobBlock(
    'biome-check.yaml',
    'apply-format'
  );

  for (const job of [formatJob, lintJob]) {
    assert.match(job, /uses: actions\/setup-node@v7/u);
    assert.match(job, /node-version: 24/u);
    assert.match(job, /printf '%s\\n' "\$biome_output"/u);
    assert.match(job, /Biome exit code \$biome_exit_code/u);
    assert.match(
      job,
      /\[ "\$total_issues" -gt 0 \] \|\| \[ "\$biome_exit_code" -ne 0 \]/u
    );
  }

  assert.doesNotMatch(workflow, /biomejs\/setup-biome@v2/u);
  assert.match(
    formatJob,
    new RegExp(
      `npx --yes @biomejs/biome@${expectedBiomeCliVersionPattern} format \\. 2>&1`,
      'u'
    )
  );
  assert.match(
    lintJob,
    new RegExp(
      `npx --yes @biomejs/biome@${expectedBiomeCliVersionPattern} lint \\. 2>&1`,
      'u'
    )
  );
  assert.match(
    applyFormatJob,
    new RegExp(
      `npx --yes @biomejs/biome@${expectedBiomeCliVersionPattern} format --write \\.`,
      'u'
    )
  );
});

test('Docker setup workflow pre-pulls the BuildKit image before Buildx setup', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'docker-setup-check.yaml'),
    'utf8'
  );
  const verifyJob = readWorkflowJobBlock('docker-setup-check.yaml', 'verify');
  const checkCiJob = readWorkflowJobBlock(
    'docker-setup-check.yaml',
    'check-ci'
  );
  const preBuildCleanupIndex = verifyJob.indexOf(
    'Free runner disk before Docker image builds'
  );
  const prePullIndex = verifyJob.indexOf('Pre-pull Docker BuildKit image');
  const setupBuildxIndex = verifyJob.indexOf('Setup Docker Buildx');
  const buildWebDevIndex = verifyJob.indexOf('Build web dev image');

  assert.match(workflow, /\npermissions:\n {2}contents: read\n/u);
  assert.match(
    checkCiJob,
    /permissions:\n {6}contents: read\n {6}deployments: read/u
  );
  assert.notEqual(preBuildCleanupIndex, -1);
  assert.notEqual(prePullIndex, -1);
  assert.notEqual(setupBuildxIndex, -1);
  assert.notEqual(buildWebDevIndex, -1);
  assert.ok(
    preBuildCleanupIndex < prePullIndex,
    'runner disk should be freed before BuildKit image pull and image builds'
  );
  assert.ok(
    prePullIndex < setupBuildxIndex,
    'BuildKit image should be pulled before setup-buildx boots BuildKit'
  );
  assert.ok(
    preBuildCleanupIndex < buildWebDevIndex,
    'runner disk should be freed before the first Docker image build'
  );
  assert.match(verifyJob, /docker system prune -af --volumes/u);
  assert.match(verifyJob, /docker builder prune -af/u);
  assert.match(verifyJob, /\/usr\/share\/dotnet/u);
  assert.match(verifyJob, /\/usr\/local\/lib\/android/u);
  assert.match(verifyJob, /\/opt\/hostedtoolcache\/CodeQL/u);
  assert.match(verifyJob, /docker pull moby\/buildkit:buildx-stable-1/u);
  assert.match(verifyJob, /driver-opts: image=moby\/buildkit:buildx-stable-1/u);
  assert.match(workflow, /scripts\/run-tanstack-e2e-docker\.js/u);
  assert.match(workflow, /scripts\/run-tanstack-e2e-docker\.test\.js/u);
  assert.match(
    verifyJob,
    /node --test scripts\/check-docker-web\.test\.js scripts\/docker-web\.test\.js scripts\/buildkit-builder\.test\.js scripts\/run-tanstack-e2e-docker\.test\.js/u
  );
});

test('Rust backend workflow validates TanStack route tree generator changes', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'rust-backend.yml'),
    'utf8'
  );
  const verifyTanstackJob = readWorkflowJobBlock(
    'rust-backend.yml',
    'verify-tanstack-web'
  );

  assert.match(workflow, /scripts\/generate-tanstack-route-tree\.js/u);
  assert.match(workflow, /scripts\/generate-tanstack-route-tree\.test\.js/u);
  assert.match(
    verifyTanstackJob,
    /node --test scripts\/generate-tanstack-route-tree\.test\.js/u
  );
  assert.ok(
    verifyTanstackJob.indexOf('Check TanStack route tree generator') <
      verifyTanstackJob.indexOf('Type-check TanStack Start app'),
    'route tree generator validation should run before TanStack type-check'
  );
});

test('Rust backend Cloudflare deploys require trusted main dispatches', () => {
  const preflightJob = readWorkflowJobBlock(
    'rust-backend.yml',
    'cloudflare-deployment-preflight'
  );
  const credentialsIndex = preflightJob.indexOf('CLOUDFLARE_API_TOKEN');
  const trustedActorIndex = preflightJob.indexOf(
    'TRUSTED_CLOUDFLARE_DEPLOY_ACTORS'
  );

  assert.match(preflightJob, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(preflightJob, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(
    preflightJob,
    /contains\(format\(',\{0\},', vars\.TRUSTED_CLOUDFLARE_DEPLOY_ACTORS\), format\(',\{0\},', github\.actor\)\)/u
  );
  assert.match(preflightJob, /inputs\.deploy_target != 'none'/u);
  assert.match(preflightJob, /needs\.check-ci\.outputs\.should_run == 'true'/u);
  assert.ok(
    trustedActorIndex > -1 &&
      credentialsIndex > -1 &&
      trustedActorIndex < credentialsIndex,
    'Cloudflare deploy actor allowlist should be checked before loading credentials'
  );
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
  assert.match(releaseJob, /uses: actions\/checkout@v7/);
  assert.match(releaseJob, /ref: production/);
  assert.match(
    releaseJob,
    /node scripts\/ci\/release-please-overflow-recovery\.js --target-branch production/
  );
  assert.match(
    releaseJob,
    /GITHUB_TOKEN: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \|\| github\.token \}\}/
  );
  assert.match(releaseJob, /uses: googleapis\/release-please-action@v5/);
  assert.ok(
    releaseJob.indexOf('Recover overflow release notes') <
      releaseJob.indexOf('Create or update release PR')
  );
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
  const platformVersion = fs
    .readFileSync(path.join(repoRoot, 'platform-version.txt'), 'utf8')
    .trim();
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
  assert.match(platformVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest['.'], platformVersion);
  assert.equal(manifest['packages/sdk'], workspaceVersions.get('packages/sdk'));
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
  const bundleJob = readWorkflowJobBlock(
    'e2e-tests.yaml',
    'prepare-e2e-images'
  );
  const e2eJob = readWorkflowJobBlock('e2e-tests.yaml', 'e2e');
  const cleanupIndex = e2eJob.indexOf('Free runner disk for Dockerized E2E');
  const runIndex = e2eJob.indexOf('Run Playwright shard');
  const diagnosticsIndex = e2eJob.indexOf('Collect Dockerized E2E diagnostics');
  const restoreIndex = e2eJob.indexOf('Restore cached Docker images');
  const loadIndex = e2eJob.indexOf('Load cached Docker images');
  const buildxIndex = e2eJob.indexOf('Setup Docker Buildx');
  const cacheExportIndex = bundleJob.indexOf(
    'Configure trusted BuildKit cache exports'
  );
  const secretIndex = e2eJob.indexOf('Prepare trusted Turbo BuildKit secrets');
  const diagnosticsUploadIndex = e2eJob.indexOf('Upload E2E failure artifact');
  const diagnosticsRedactionIndex = e2eJob.indexOf(
    'Redact E2E diagnostics artifact'
  );

  assert.match(
    workflow,
    /\n {2}push:\n {4}branches-ignore:\n {6}- production\n/
  );
  assert.match(
    e2eJob,
    /BASE_URL: https:\/\/tuturuuu\.localhost:1355/u,
    'E2E must exercise the shared-cookie localhost domain on the unprivileged Portless port'
  );
  assert.match(e2eJob, /PORTLESS_PORT: "1355"/u);
  assert.match(e2eJob, /github\.ref != 'refs\/heads\/production'/);
  assert.match(
    e2eJob,
    /package-manager-cache: false/u,
    'setup-node must not run a second Bun package-manager cache restore'
  );
  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(runIndex, -1);
  assert.notEqual(diagnosticsIndex, -1);
  assert.notEqual(restoreIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.notEqual(buildxIndex, -1);
  assert.notEqual(cacheExportIndex, -1);
  assert.notEqual(secretIndex, -1);
  assert.notEqual(diagnosticsUploadIndex, -1);
  assert.notEqual(diagnosticsRedactionIndex, -1);
  assert.doesNotMatch(
    e2eJob,
    /name: Start Portless shared localhost proxy/u,
    'Docker E2E runner must own Portless startup after Docker is healthy'
  );
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
    buildxIndex < runIndex,
    'Buildx must be selected before Docker Compose starts the E2E stack'
  );
  assert.ok(
    runIndex < diagnosticsIndex,
    'E2E diagnostics must run after the shard command can fail'
  );
  assert.ok(
    diagnosticsIndex < diagnosticsUploadIndex,
    'E2E diagnostics must be collected before uploading the diagnostics artifact'
  );
  assert.ok(
    diagnosticsIndex < diagnosticsRedactionIndex,
    'E2E diagnostics must be collected before artifact redaction runs'
  );
  assert.ok(
    diagnosticsRedactionIndex < diagnosticsUploadIndex,
    'E2E diagnostics must be redacted before artifact upload'
  );
  assert.match(e2eJob, /docker system prune -af --volumes/u);
  assert.match(e2eJob, /docker builder prune -af/u);
  assert.match(e2eJob, /\/usr\/share\/dotnet/u);
  assert.match(e2eJob, /\/usr\/local\/lib\/android/u);
  assert.match(e2eJob, /\/usr\/local\/share\/boost/u);
  assert.match(e2eJob, /\/usr\/share\/swift/u);
  assert.match(e2eJob, /\/opt\/az/u);
  assert.match(e2eJob, /\/opt\/hostedtoolcache\/CodeQL/u);
  assert.match(e2eJob, /if: \$\{\{ failure\(\) \}\}/u);
  assert.match(
    e2eJob,
    /key: supabase-docker-v2-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.supabase-version\.outputs\.version \}\}-images/u,
    'Supabase Docker cache keys must be stable for the platform and CLI version'
  );
  assert.match(
    e2eJob,
    /restore-keys: \|\n {12}supabase-docker-v2-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.supabase-version\.outputs\.version \}\}-/u
  );
  assert.match(
    e2eJob,
    /steps\.cache-supabase\.outputs\.cache-matched-key != ''/u
  );
  assert.match(
    e2eJob,
    /github\.ref == 'refs\/heads\/main' && matrix\.shard == 1 && steps\.cache-supabase\.outputs\.cache-matched-key == ''/u
  );
  assert.doesNotMatch(e2eJob, /github\.(?:run_id|run_attempt).*supabase/u);
  assert.match(
    e2eJob,
    /id: prepare-supabase-docker-cache/u,
    'E2E cache upload must verify a tarball exists before saving'
  );
  assert.match(e2eJob, /cache-ready=true/u);
  assert.match(
    e2eJob,
    /steps\.prepare-supabase-docker-cache\.outputs\.cache-ready == 'true'/u
  );
  assert.match(e2eJob, /DOCKER_WEB_CACHE_WEB_FROM: type=gha/u);
  assert.match(e2eJob, /DOCKER_WEB_CACHE_BACKEND_FROM: type=gha/u);
  assert.match(e2eJob, /DOCKER_WEB_CACHE_TANSTACK_FROM: type=gha/u);
  assert.match(bundleJob, /DOCKER_WEB_CACHE_WEB_FROM: type=gha/u);
  assert.match(bundleJob, /DOCKER_WEB_CACHE_BACKEND_FROM: type=gha/u);
  assert.match(bundleJob, /DOCKER_WEB_CACHE_TANSTACK_FROM: type=gha/u);
  assert.match(e2eJob, /uses: docker\/setup-buildx-action@v4/u);
  assert.match(bundleJob, /uses: docker\/setup-buildx-action@v4/u);
  assert.match(
    e2eJob,
    /BUILDX_BUILDER=\$\{\{ steps\.buildx\.outputs\.name \}\}/u
  );
  assert.match(bundleJob, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(bundleJob, /scope=docker-chat-realtime,mode=min/u);
  assert.match(bundleJob, /scope=docker-hive-prod,mode=min/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_WEB_TO/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_BACKEND_TO/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_TANSTACK_TO/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_STORAGE_UNZIP_TO/u);
  assert.doesNotMatch(e2eJob, /DOCKER_WEB_CACHE_[A-Z_]+_TO/u);
  assert.match(e2eJob, /DOCKER_WEB_TURBO_TOKEN_SECRET_FILE/u);
  assert.match(bundleJob, /DOCKER_WEB_TURBO_TOKEN_SECRET_FILE/u);
  assert.match(e2eJob, /github\.actor != 'dependabot\[bot\]'/u);
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
    /curl -i --max-time 10 "\$web_proxy_login_url" > "\$diagnostics_dir\/web-proxy-login\.txt"/u
  );
  assert.match(
    e2eJob,
    /curl -k -i --max-time 10 "\$portless_login_url" > "\$diagnostics_dir\/portless-login\.txt"/u
  );
  assert.match(e2eJob, /apps\/web\/test-results\/\.last-run\.json/u);
  assert.match(e2eJob, /sensitiveKeyValuePattern/u);
  assert.match(e2eJob, /Authorization:\\s\*Bearer/u);
  assert.match(e2eJob, /walkFiles\(diagnosticsDir\)/u);
  assert.match(
    e2eJob,
    /name: e2e-failure-\$\{\{ matrix\.shard \}\}-of-\$\{\{ matrix\.total_shards \}\}/u
  );
  assert.match(e2eJob, /tmp\/e2e-diagnostics\//u);
  assert.match(e2eJob, /apps\/web\/blob-report\//u);
  assert.match(e2eJob, /apps\/web\/test-results\//u);
  assert.match(e2eJob, /if-no-files-found: warn/u);
  assert.match(e2eJob, /retention-days: 7/u);
  assert.doesNotMatch(e2eJob, /name: playwright-report-/u);
  assert.doesNotMatch(e2eJob, /name: test-results-/u);
});

test('E2E workflow runs TanStack migration dual-stack and compare smoke jobs', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );
  const migrationJob = readWorkflowJobBlock('e2e-tests.yaml', 'migration-e2e');
  const cleanupIndex = migrationJob.indexOf(
    'Free runner disk for Dockerized migration E2E'
  );
  const installIndex = migrationJob.indexOf('Install dependencies');
  const buildxIndex = migrationJob.indexOf('Setup Docker Buildx');
  const runIndex = migrationJob.indexOf('Run migration E2E');
  const uploadIndex = migrationJob.indexOf('Upload migration E2E artifacts');
  const stopIndex = migrationJob.indexOf('Stop migration E2E stacks');

  assert.match(workflow, /\n {2}workflow_dispatch:\n/u);
  assert.match(migrationJob, /needs: \[check-ci, prepare-e2e-images\]/u);
  assert.match(migrationJob, /if: \$\{\{ always\(\)/u);
  assert.match(
    migrationJob,
    /github\.ref != 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/u
  );
  assert.match(migrationJob, /mode: tanstack-dual-stack/u);
  assert.match(
    migrationJob,
    /command: bun test:e2e:tanstack:docker -- -- --project=chromium/u,
    'TanStack runner needs a literal -- before Playwright args'
  );
  assert.match(migrationJob, /playwright_workdir: apps\/tanstack-web/u);
  assert.match(migrationJob, /setup_supabase: "false"/u);
  assert.match(migrationJob, /mode: compare-smoke/u);
  assert.match(
    migrationJob,
    /command: bun test:e2e:web:docker:compare -- public-marketing-routes\.noauth\.spec\.ts --project=chromium-no-auth/u
  );
  assert.match(migrationJob, /playwright_workdir: apps\/web/u);
  assert.match(migrationJob, /setup_supabase: "true"/u);
  assert.match(migrationJob, /if: matrix\.setup_supabase == 'true'/u);
  assert.match(
    migrationJob,
    /uses: \.\/\.github\/actions\/setup-supabase-cli-with-retry/u
  );
  assert.match(
    migrationJob,
    /working-directory: \$\{\{ matrix\.playwright_workdir \}\}/u
  );
  assert.match(migrationJob, /run: \$\{\{ matrix\.command \}\}/u);
  assert.match(migrationJob, /name: migration-e2e-\$\{\{ matrix\.mode \}\}/u);
  assert.match(
    migrationJob,
    /path: \|\n {12}apps\/tanstack-web\/playwright-report\//u
  );
  assert.match(migrationJob, /tmp\/e2e\/web-migration\/\*\.json/u);
  assert.match(migrationJob, /if-no-files-found: ignore/u);
  assert.match(migrationJob, /retention-days: 7/u);
  assert.match(migrationJob, /if: \$\{\{ failure\(\) \}\}/u);
  assert.match(migrationJob, /DOCKER_WEB_CACHE_BACKEND_FROM: type=gha/u);
  assert.match(migrationJob, /DOCKER_WEB_CACHE_TANSTACK_FROM: type=gha/u);
  assert.match(migrationJob, /uses: docker\/setup-buildx-action@v4/u);
  assert.match(
    migrationJob,
    /BUILDX_BUILDER=\$\{\{ steps\.buildx\.outputs\.name \}\}/u
  );
  assert.doesNotMatch(
    migrationJob,
    /Configure trusted BuildKit cache exports/u
  );
  assert.doesNotMatch(migrationJob, /DOCKER_WEB_CACHE_[A-Z_]+_TO/u);
  assert.match(
    migrationJob,
    /docker compose -f docker-compose\.tanstack-dual\.yml down \|\| true/u
  );
  assert.match(
    migrationJob,
    /node scripts\/docker-web\.js down --mode prod --strategy blue-green --env-file tmp\/e2e\/web\.env \|\| true/u
  );
  assert.match(migrationJob, /bun sb:stop \|\| true/u);
  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(installIndex, -1);
  assert.notEqual(buildxIndex, -1);
  assert.notEqual(runIndex, -1);
  assert.notEqual(uploadIndex, -1);
  assert.notEqual(stopIndex, -1);
  assert.ok(cleanupIndex < installIndex);
  assert.ok(buildxIndex < runIndex);
  assert.ok(installIndex < runIndex);
  assert.ok(runIndex < uploadIndex);
  assert.ok(runIndex < stopIndex);
  assert.match(migrationJob, /docker system prune -af --volumes/u);
  assert.match(migrationJob, /docker builder prune -af/u);
  assert.match(migrationJob, /\/usr\/share\/swift/u);
  assert.match(migrationJob, /\/usr\/local\/share\/boost/u);
  assert.match(migrationJob, /\/opt\/az/u);
});

test('Supabase production migration requires production platform deploy and successful staged SHA', () => {
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
    /production platform deployment trigger ran on '\$TRIGGER_BRANCH' instead of production/
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
    /no production platform deployment workflow run was found for \$TARGET_SHA/
  );
  assert.match(
    evaluateJob,
    /deployments\?environment=vercel-production-platform&per_page=100/
  );
  assert.match(
    evaluateJob,
    /no production platform deployment marker was found for \$TARGET_SHA/
  );
  assert.match(
    evaluateJob,
    /\(\(\$payload\.markerKind \/\/ "deployment"\) == "deployment"\)/
  );
  assert.match(evaluateJob, /DEPLOYMENT_MARKER_HAS_SUCCESS" != "true"/);
  assert.match(evaluateJob, /does not include a success status/);
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
    /Production platform deployment marker and staging migration are bound to \$TARGET_SHA/
  );

  assert.match(
    deployJob,
    /ref: \$\{\{ needs\.evaluate-prerequisites\.outputs\.target_sha \}\}/
  );
  assert.match(deployJob, /supabase db push --include-all/);
});

test('environment-scoped Vercel workflows scope project secrets to protected jobs', () => {
  const projectSecretsByApp = {
    apps: 'VERCEL_APPS_PROJECT_ID',
    calendar: 'VERCEL_CALENDAR_PROJECT_ID',
    chat: 'VERCEL_CHAT_PROJECT_ID',
    cms: 'VERCEL_CMS_PROJECT_ID',
    contacts: 'VERCEL_CONTACTS_PROJECT_ID',
    drive: 'VERCEL_DRIVE_PROJECT_ID',
    finance: 'VERCEL_FINANCE_PROJECT_ID',
    inventory: 'VERCEL_INVENTORY_PROJECT_ID',
    infrastructure: 'VERCEL_INFRASTRUCTURE_PROJECT_ID',
    storefront: 'VERCEL_STOREFRONT_PROJECT_ID',
    learn: 'VERCEL_LEARN_PROJECT_ID',
    mail: 'VERCEL_MAIL_PROJECT_ID',
    meet: 'VERCEL_TUMEET_PROJECT_ID',
    mind: 'VERCEL_MIND_PROJECT_ID',
    nova: 'VERCEL_NOVA_PROJECT_ID',
    pay: 'VERCEL_PAY_PROJECT_ID',
    platform: 'VERCEL_PLATFORM_PROJECT_ID',
    qr: 'VERCEL_QR_PROJECT_ID',
    rewise: 'VERCEL_REWISE_PROJECT_ID',
    shortener: 'VERCEL_SHORTENER_PROJECT_ID',
    'tanstack-web': 'VERCEL_TANSTACK_WEB_PROJECT_ID',
    tasks: 'VERCEL_TUDO_PROJECT_ID',
    teach: 'VERCEL_TEACH_PROJECT_ID',
    tools: 'VERCEL_TOOLS_PROJECT_ID',
    track: 'VERCEL_TRACK_PROJECT_ID',
  };
  const forbiddenWorkflowSecrets = [
    'ENCRYPTION_MASTER_KEY',
    'GOOGLE_VERTEX_LOCATION',
    'GOOGLE_VERTEX_PROJECT',
    'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
    'PRODUCTION_SUPABASE_SECRET_KEY',
    'PRODUCTION_SUPABASE_URL',
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
    const isPlatformPreview = workflowName === 'vercel-preview-platform.yaml';
    const jobName = getVercelRunJobName(workflowName);
    const expectedEnvironment = `vercel-${target}-${app}`;
    const expectedRefGuard =
      isPreview && isPlatformPreview
        ? /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'[\s\S]*github\.event_name == 'workflow_dispatch'[\s\S]*github\.ref == 'refs\/heads\/main'/
        : isPreview
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
    const installIndex = workflow.indexOf(
      'run: bash scripts/ci/run-with-backoff.sh bun install\n'
    );
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
      if (isPlatformPreview) {
        assert.match(
          header,
          /\n {2}push:\n {4}branches:\n {6}- main\n/,
          'platform preview must expose deployment secrets only to protected main push code'
        );
      } else {
        assert.doesNotMatch(
          header,
          /\n {2}push:/,
          `${workflowName} must not expose deployment secrets to branch push workflows`
        );
      }
      assert.match(header, /\n {2}workflow_dispatch:\n/);
      assert.match(header, /\n {6}preview_ref:\n/);
      assert.match(
        deployJob,
        /vars\.TRUSTED_PREVIEW_DEPLOY_ACTORS/,
        `${workflowName} must require a trusted manual preview deploy actor`
      );
      assert.match(
        deployJob,
        isPlatformPreview
          ? /ref: \$\{\{ github\.event\.inputs\.preview_ref \|\| github\.sha \}\}/
          : /ref: \$\{\{ inputs\.preview_ref \}\}/,
        isPlatformPreview
          ? `${workflowName} must check out the protected push SHA or manually approved preview ref`
          : `${workflowName} must check out the manually approved preview ref`
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
    assert.match(
      deployJob,
      /token: \$\{\{ github\.actor != 'dependabot\[bot\]' && secrets\.TURBO_TOKEN \|\| '' \}\}/,
      `${workflowName} must pass the remote-cache token only to the wrapper`
    );
    assert.match(
      deployJob,
      /team: \$\{\{ vars\.TURBO_TEAM \|\| secrets\.TURBO_TEAM \}\}/,
      `${workflowName} must prefer the repository team variable`
    );
    assert.doesNotMatch(
      workflow,
      /^ {0,8}TURBO_(?:TOKEN|TEAM|API|REMOTE_CACHE_SIGNATURE_KEY):/mu,
      `${workflowName} must not put remote-cache credentials at workflow or job scope`
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

test('TanStack production Vercel workflow skips when project secret is absent', () => {
  const workflowName = 'vercel-production-tanstack-web.yaml';
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', workflowName),
    'utf8'
  );
  const deployJob = readWorkflowJobBlock(workflowName, 'Build-Production');
  const guardedStepPattern =
    /if: steps\.check_commits\.outputs\.skip_build != 'true' && steps\.vercel_config\.outputs\.configured == 'true'/g;

  assert.match(deployJob, /- name: Check Vercel project configuration/);
  assert.match(deployJob, /\n {8}id: vercel_config\n/);
  assert.match(
    deployJob,
    /VERCEL_PROJECT_ID: \$\{\{ secrets\.VERCEL_TANSTACK_WEB_PROJECT_ID \}\}/
  );
  assert.match(deployJob, /configured=false/);
  assert.match(deployJob, /TanStack Web Vercel deployment skipped/);
  assert.ok(
    [...workflow.matchAll(guardedStepPattern)].length >= 4,
    'Vercel pull/build/marker steps must be skipped when project config is missing'
  );
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
    artifactDir: 'apis-package',
    artifactName: 'tuturuuu-apis-npm-package',
    environment: 'apis-release-production',
    packageName: '@tuturuuu/apis',
    packagePath: 'packages/apis',
    rejectMessagePattern:
      /@tuturuuu\/apis releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /bun run --filter @tuturuuu\/supabase build/,
      /bun run --filter @tuturuuu\/internal-api build/,
      /working-directory: packages\/apis/,
      /run: bun run type-check/,
      /run: bun run test/,
    ],
    workflowName: 'release-apis-package.yaml',
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
    artifactDir: 'google-package',
    artifactName: 'tuturuuu-google-npm-package',
    environment: 'google-release-production',
    packageName: '@tuturuuu/google',
    packagePath: 'packages/google',
    rejectMessagePattern:
      /@tuturuuu\/google releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/google/,
      /run: bun run type-check/,
    ],
    workflowName: 'release-google-package.yaml',
  },
  {
    artifactDir: 'hooks-package',
    artifactName: 'tuturuuu-hooks-npm-package',
    environment: 'hooks-release-production',
    packageName: '@tuturuuu/hooks',
    packagePath: 'packages/hooks',
    rejectMessagePattern:
      /@tuturuuu\/hooks releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /working-directory: packages\/hooks/,
      /run: bun run type-check/,
    ],
    workflowName: 'release-hooks-package.yaml',
  },
  {
    artifactDir: 'icons-package',
    artifactName: 'tuturuuu-icons-npm-package',
    environment: 'icons-release-production',
    packageName: '@tuturuuu/icons',
    packagePath: 'packages/icons',
    rejectMessagePattern:
      /@tuturuuu\/icons releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /working-directory: packages\/icons/,
      /run: bun run type-check/,
    ],
    workflowName: 'release-icons-package.yaml',
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
      /bun run --filter @tuturuuu\/supabase build/,
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
    artifactDir: 'utils-package',
    artifactName: 'tuturuuu-utils-npm-package',
    environment: 'utils-release-production',
    packageName: '@tuturuuu/utils',
    packagePath: 'packages/utils',
    rejectMessagePattern:
      /@tuturuuu\/utils releases can only run from refs\/heads\/production/,
    requiredBuildPatterns: [
      /bun run --filter @tuturuuu\/types build/,
      /bun run --filter @tuturuuu\/supabase build/,
      /bun run --filter @tuturuuu\/internal-api build/,
      /working-directory: packages\/utils/,
      /run: bun run type-check/,
      /run: bun run test/,
    ],
    workflowName: 'release-utils-package.yaml',
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
      /bun run --filter @tuturuuu\/supabase build/,
      /bun run --filter @tuturuuu\/internal-api build/,
      /working-directory: packages\/sdk/,
      /run: bun run test/,
    ],
    workflowName: 'release-sdk-package.yaml',
  },
];

function parseDeclaredNeeds(jobBlock) {
  const needsLine = jobBlock
    .split('\n')
    .find((line) => /^ {4}needs:/u.test(line));

  if (!needsLine) return new Set();

  const value = needsLine.replace(/^ {4}needs:\s*/u, '').trim();

  if (value.startsWith('[') && value.endsWith(']')) {
    return new Set(
      value
        .slice(1, -1)
        .split(',')
        .map((need) => need.trim())
        .filter(Boolean)
    );
  }

  return new Set([value]);
}

function assertNeedsReferencesAreDeclared({ jobBlock, jobName, workflowName }) {
  const declaredNeeds = parseDeclaredNeeds(jobBlock);
  const referencedNeeds = [
    ...jobBlock.matchAll(/\bneeds\.([A-Za-z0-9_-]+)/gu),
  ].map((match) => match[1]);

  for (const referencedNeed of referencedNeeds) {
    assert.ok(
      declaredNeeds.has(referencedNeed),
      `${workflowName} ${jobName} references needs.${referencedNeed} without declaring it in needs`
    );
    assert.notEqual(
      referencedNeed,
      jobName,
      `${workflowName} ${jobName} must not reference its own needs outputs`
    );
  }
}

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
    const releaseGateJob = readWorkflowJobBlock(workflowName, 'release-gate');
    const buildJob = readWorkflowJobBlock(workflowName, 'build');
    const prepareJob = readWorkflowJobBlock(
      workflowName,
      'prepare-publish-npm'
    );
    const publishJob = readWorkflowJobBlock(workflowName, 'publish-npm');
    const dispatchJob = readWorkflowJobBlock(
      workflowName,
      'dispatch-dependent-releases'
    );

    for (const [jobName, jobBlock] of Object.entries({
      build: buildJob,
      'check-ci': checkCiJob,
      'check-version-bump': checkVersionBumpJob,
      'dispatch-dependent-releases': dispatchJob,
      'prepare-publish-npm': prepareJob,
      'publish-npm': publishJob,
      'reject-non-production-ref': rejectJob,
      'release-gate': releaseGateJob,
    })) {
      assertNeedsReferencesAreDeclared({ jobBlock, jobName, workflowName });
    }

    assert.match(workflow, /\n {2}push:\n {4}branches:\s*\[production\]/);
    assert.match(workflow, new RegExp(`"${packagePath}/package\\.json"`));
    assert.match(workflow, new RegExp(`"\\.github/workflows/${workflowName}"`));
    assert.match(
      workflow,
      /\nconcurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: false\n/
    );
    assert.doesNotMatch(workflow, /\n {2}pull_request:\n/);
    assert.doesNotMatch(workflow, /github\.event\.pull_request/);
    assert.doesNotMatch(workflow, /pull_request\.title/);
    assert.doesNotMatch(workflow, /wait-workspace-dependencies/);
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
    assert.match(releaseGateJob, /needs:\s*\[check-version-bump\]/);
    assert.match(
      releaseGateJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.check-version-bump\.outputs\.should_release == 'true'/
    );
    assert.match(releaseGateJob, /actions:\s*write/);
    assert.match(releaseGateJob, /contents:\s*read/);
    assert.match(releaseGateJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(
      releaseGateJob,
      /dependent_workflows: \$\{\{ steps\.gate\.outputs\.dependent_workflows \}\}/
    );
    assert.ok(
      releaseGateJob.includes(
        `node scripts/ci/package-release-readiness.js gate-package-release ${packagePath}`
      ),
      `${workflowName} must gate package releases before build starts`
    );
    assert.match(buildJob, /needs:\s*release-gate/);
    assert.match(
      buildJob,
      /if: github\.ref == 'refs\/heads\/production' && needs\.release-gate\.outputs\.should_publish == 'true' && needs\.release-gate\.outputs\.dependencies_ready == 'true'/
    );
    assert.match(prepareJob, /if: github\.ref == 'refs\/heads\/production'/);
    assert.match(prepareJob, /contents:\s*read/);
    assert.doesNotMatch(prepareJob, /actions:\s*write/);
    assert.doesNotMatch(prepareJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(
      prepareJob,
      /npm view "\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}" version/
    );
    assert.match(prepareJob, /npm pack --ignore-scripts --pack-destination/);
    const prepareManifestIndex = prepareJob.indexOf(
      `node scripts/ci/prepare-npm-package-manifest.js ${packagePath}`
    );
    const packIndex = prepareJob.indexOf(
      'npm pack --ignore-scripts --pack-destination'
    );

    assert.notEqual(
      prepareManifestIndex,
      -1,
      `${workflowName} must prepare npm package manifests before packing`
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
    assert.match(dispatchJob, /needs:\s*\[release-gate, publish-npm\]/);
    assert.match(dispatchJob, /needs\.publish-npm\.result == 'success'/);
    assert.match(
      dispatchJob,
      /needs\.release-gate\.outputs\.dependent_workflows != '\[\]'/
    );
    assert.match(dispatchJob, /actions:\s*write/);
    assert.match(dispatchJob, /contents:\s*read/);
    assert.match(
      dispatchJob,
      /DEPENDENT_WORKFLOWS: \$\{\{ needs\.release-gate\.outputs\.dependent_workflows \}\}/
    );
    assert.doesNotMatch(dispatchJob, /id-token:\s*write/);
    assert.doesNotMatch(dispatchJob, /actions\/checkout@/);
    assert.doesNotMatch(dispatchJob, /npm publish/);
    assert.doesNotMatch(dispatchJob, /NODE_AUTH_TOKEN/);
    assert.doesNotMatch(dispatchJob, /\bsecrets\./);
  }
});

test('package trusted publishing avoids secret-redacted metadata outputs', () => {
  for (const {
    artifactDir,
    artifactName,
    environment,
    packageName,
    packagePath,
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

    if (packagePath === 'packages/typescript-config') {
      assert.match(buildJob, /Validate package metadata/);
    } else {
      assert.match(
        buildJob,
        /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/
      );
      assert.match(buildJob, /--concurrency=4/);
      assert.match(
        buildJob,
        new RegExp(`--filter=${packageName.replace('/', '\\/')}`)
      );
    }

    // The Turbo team slug can also appear inside a scoped npm package name.
    // GitHub then treats that job output as secret-bearing and drops it, so the
    // OIDC job must use the repository-verified static package name instead.
    assert.doesNotMatch(
      prepareJob,
      /package_name: \$\{\{ steps\.version-check\.outputs\.package_name \}\}/
    );
    assert.doesNotMatch(prepareJob, /echo "package_name=/);
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
      new RegExp(`EXPECTED_PACKAGE_NAME: "${packageName.replace('/', '\\/')}"`)
    );
    assert.doesNotMatch(
      publishJob,
      /needs\.prepare-publish-npm\.outputs\.package_name/
    );
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
