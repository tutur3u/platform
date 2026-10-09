const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readWorkflowJobBlock,
  repoRoot,
} = require('./workflow-config-test-helpers');
const { readWorkflow } = require('./workflow-yaml-test-helper');

function readRunnerSource() {
  return ['e2e-free-disk.sh', 'e2e-diagnostics.sh', 'e2e-diagnostics-redact.js']
    .map((file) =>
      fs.readFileSync(path.join(repoRoot, 'scripts/ci', file), 'utf8')
    )
    .join('\n');
}

test('E2E workflow frees runner disk before loading cached Docker images', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );
  const bundleJob = readWorkflowJobBlock(
    'e2e-tests.yaml',
    'prepare-e2e-images'
  );
  const e2eJob =
    readWorkflowJobBlock('e2e-tests.yaml', 'e2e') + readRunnerSource();
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
  assert.match(e2eJob, /if: \$\{\{ false \}\}/);
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
    /github\.ref == 'refs\/heads\/main' && matrix\.mode == 'shard' && matrix\.shard == 1 && steps\.cache-supabase\.outputs\.cache-matched-key == ''/u
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
  assert.doesNotMatch(e2eJob, /DOCKER_WEB_CACHE_BACKEND_FROM: type=gha/u);
  assert.doesNotMatch(e2eJob, /DOCKER_WEB_CACHE_TANSTACK_FROM: type=gha/u);
  assert.match(bundleJob, /DOCKER_WEB_CACHE_WEB_FROM: type=gha/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_BACKEND_FROM: type=gha/u);
  assert.doesNotMatch(bundleJob, /DOCKER_WEB_CACHE_TANSTACK_FROM: type=gha/u);
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
  const upload = readWorkflow('e2e-tests.yaml').jobs.e2e.steps.find(
    (step) => step.name === 'Upload E2E failure artifact'
  );
  assert.equal(upload.with.path, 'tmp/e2e-diagnostics/');
  assert.match(upload.if, /steps\.redact-diagnostics\.outcome == 'success'/u);
  assert.match(e2eJob, /name: e2e-failure-\$\{\{ matrix\.id \}\}/u);
  assert.match(e2eJob, /if-no-files-found: warn/u);
  assert.match(e2eJob, /retention-days: 7/u);
  assert.doesNotMatch(e2eJob, /name: playwright-report-/u);
  assert.doesNotMatch(e2eJob, /name: test-results-/u);
});

test('E2E workflow retains the paused migration restart contract', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );
  const migrationJob =
    readWorkflowJobBlock('e2e-tests.yaml', 'migration-e2e') +
    readRunnerSource();
  const cleanupIndex = migrationJob.indexOf(
    'Free runner disk for Dockerized migration E2E'
  );
  const installIndex = migrationJob.indexOf('Install dependencies');
  const buildxIndex = migrationJob.indexOf('Setup Docker Buildx');
  const runIndex = migrationJob.indexOf('Run migration E2E');
  const uploadIndex = migrationJob.indexOf('Upload migration E2E artifacts');
  const stopIndex = migrationJob.indexOf('Stop migration E2E stacks');

  assert.match(workflow, /\n {2}workflow_dispatch:\n/u);
  assert.match(migrationJob, /needs: \[prepare-e2e-images\]/u);
  assert.match(migrationJob, /if: \$\{\{ false \}\}/u);
  assert.doesNotMatch(migrationJob, /refs\/heads\/production/u);
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
test('paused E2E jobs retain trusted proof rules without allocating runners', () => {
  const workflow = readWorkflow('e2e-tests.yaml');
  assert.equal(workflow.permissions.actions, 'read');
  assert.ok(workflow.on.push.paths.includes('**'));
  assert.ok(workflow.on.push.paths.includes('!apps/docs/**'));
  for (const id of [
    'prepare-e2e-images',
    'e2e',
    'inventory-storefront-cache-e2e',
    'cleanup-e2e-images',
  ]) {
    assert.match(workflow.jobs[id].if, /^\$\{\{ false \}\}$/u);
  }
  for (const id of ['e2e', 'inventory-storefront-cache-e2e']) {
    const steps = workflow.jobs[id].steps;
    const proof = steps.find((step) => step.id === 'proof');
    const save = steps.find(
      (step) => step.name === 'Cache successful E2E proof'
    );
    assert.match(
      proof.if,
      /success\(\).*event_name == 'push'.*ref == 'refs\/heads\/main'/u
    );
    assert.match(save.if, /success\(\).*outputs\.reusable == 'true'/u);
    assert.equal(save.uses, 'actions/cache/save@v6');
    assert.equal(save.with.path, 'tmp/e2e-proof-receipt.json');
    assert.equal(save.with['restore-keys'], undefined);
    const proofIndex = steps.indexOf(proof);
    const secretCleanupIndex = steps.findIndex(
      (step) => step.name === 'Remove Turbo BuildKit secret files'
    );
    if (id === 'e2e') {
      assert.notEqual(
        secretCleanupIndex,
        -1,
        'Web runners must remove Turbo secrets'
      );
      assert.ok(proofIndex > secretCleanupIndex);
    } else {
      assert.equal(
        secretCleanupIndex,
        -1,
        'Inventory does not install Turbo secret files'
      );
    }
    const stopIndex = steps.findIndex((step) =>
      /\bbun sb:stop\b/u.test(step.run ?? '')
    );
    assert.notEqual(stopIndex, -1, `${id} must stop its Supabase fixture`);
    assert.equal(steps[stopIndex].if, 'always()');
    assert.ok(
      proofIndex > stopIndex,
      `${id} must finish fixture cleanup before proof`
    );
    assert.ok(
      steps.some((step) => /--reporter=[^\s]*json/u.test(step.run ?? ''))
    );
  }
});
