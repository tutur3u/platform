// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are tested as literal YAML values.
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { cp, mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const { discoverScriptTests } = require('../run-script-tests');
const root = resolve(__dirname, '../..');
const workflow = readWorkflow('meet-cloudflare.yaml');

test('Meet generates source metadata before dependency and Worker builds', () => {
  const steps = workflow.jobs.validate.steps;
  const index = steps.findIndex((step) =>
    step.run?.includes('scripts/ci/generate-build-metadata.ts')
  );
  assert.ok(index >= 0, 'shared metadata generation is missing');
  for (const [label, matchesBuild] of [
    [
      'types',
      (command) =>
        command.includes('bun turbo:local run build') &&
        command.includes('--filter=@tuturuuu/types'),
    ],
    [
      'supabase',
      (command) =>
        command.includes('bun turbo:local run build') &&
        command.includes('--filter=@tuturuuu/supabase'),
    ],
    [
      'Meet core dependencies',
      (command) =>
        command.includes('bun turbo:local run build') &&
        command.includes("--filter='@tuturuuu/meet-core^...'"),
    ],
    ['Worker', (command) => command.includes('bun run build:cloudflare')],
  ]) {
    const builds = steps.flatMap((step, buildIndex) =>
      matchesBuild(step.run ?? step.with?.command ?? '') ? [buildIndex] : []
    );
    assert.ok(builds.length > 0, `${label} build is missing`);
    for (const build of builds) {
      assert.ok(
        build > index,
        `${label} build must follow metadata generation`
      );
    }
  }
  const env = steps[index].env;
  assert.equal(
    env.PLATFORM_BUILD_ENVIRONMENT,
    "${{ github.ref == 'refs/heads/production' && 'production' || 'preview' }}"
  );
  assert.equal(env.PLATFORM_BUILD_REF_NAME, '${{ github.ref_name }}');
  assert.equal(env.PLATFORM_BUILD_COMMIT_HASH, '${{ github.sha }}');
});

test('only the production deploy verifies canonical identity before its success marker', () => {
  assert.equal(
    workflow.jobs.deploy.if,
    "github.ref == 'refs/heads/production'"
  );
  const steps = workflow.jobs.deploy.steps;
  const verify = steps.findIndex((step) =>
    step.run?.includes('scripts/ci/verify-meet-build-info.js')
  );
  const deploy = steps.findIndex(
    (step) => step.name === 'Deploy the verified frontend'
  );
  const marker = steps.findIndex((step) =>
    step.run?.includes('record-deployment-marker.ts')
  );
  assert.ok(
    verify > deploy && marker > verify,
    'canonical identity must gate the success marker'
  );
  assert.notEqual(steps[verify]['continue-on-error'], true);
  assert.ok(
    !workflow.jobs.validate.steps.some((step) =>
      step.run?.includes('verify-meet-build-info.js')
    )
  );
});

test('Meet qualifies the native artifact and restored runtime before publication', () => {
  for (const job of ['validate', 'deploy']) {
    const steps = workflow.jobs[job].steps;
    const node = steps.find((step) =>
      step.uses?.startsWith('actions/setup-node@')
    );
    assert.equal(String(node.with['node-version']), '24.22.0');
  }
  const validate = workflow.jobs.validate.steps;
  const build = validate.findIndex((step) =>
    step.with?.command?.includes('bun run build:cloudflare')
  );
  const discover = validate.findIndex((step) => step.id === 'meet-output');
  const types = validate.findIndex((step) =>
    step.run?.includes('wrangler types --config')
  );
  const runtime = validate.findIndex((step) =>
    step.run?.includes(
      'node --test scripts/ci/meet-cloudflare-render.runtime.mjs'
    )
  );
  const seal = validate.findIndex((step) =>
    step.run?.includes('verify-meet-start-output.js seal')
  );
  const upload = validate.findIndex(
    (step) =>
      step.uses?.startsWith('actions/upload-artifact@') &&
      step.with?.path === '${{ runner.temp }}/meet-worker.tar.gz'
  );
  assert.ok(
    build >= 0 &&
      discover > build &&
      types > discover &&
      runtime > types &&
      seal > runtime &&
      upload > seal
  );
  artifactArchiveCommand(validate[seal].run);
  assert.equal(validate[seal].if, undefined);
  assert.notEqual(validate[seal]['continue-on-error'], true);
  assert.equal(
    validate[upload].with.path,
    '${{ runner.temp }}/meet-worker.tar.gz'
  );
  const deploy = workflow.jobs.deploy.steps;
  const restore = deploy.findIndex(
    (step) => step.name === 'Restore and verify exact frontend artifact'
  );
  const dryrun = deploy.findIndex(
    (step) => step.name === 'Dry-run restored frontend artifact'
  );
  const restoredRuntime = deploy.findIndex(
    (step) =>
      step.name === 'Verify restored Start runtime before production writes'
  );
  const recheck = deploy.findIndex(
    (step) =>
      step.name === 'Recheck artifact after restored runtime qualification'
  );
  const rollback = deploy.findIndex(
    (step) => step.name === 'Retain rollback version evidence'
  );
  const signaling = deploy.findIndex(
    (step) => step.name === 'Deploy signaling before the frontend'
  );
  const publish = deploy.findIndex(
    (step) => step.name === 'Deploy the verified frontend'
  );
  assert.ok(
    restore >= 0 &&
      dryrun > restore &&
      restoredRuntime > dryrun &&
      recheck > restoredRuntime &&
      rollback > recheck &&
      signaling > rollback &&
      publish > signaling
  );
  assert.match(deploy[publish].run, /verify-meet-start-output\.js verify/);
  assert.match(
    deploy[publish].run,
    /wrangler deploy -c "\$\{\{ steps\.meet-output\.outputs\.config \}\}" --message/
  );
  assert.doesNotMatch(
    deploy[publish].run,
    /void deploy|build:cloudflare|wrangler\.legacy/
  );
  assert.notEqual(deploy[restoredRuntime]['continue-on-error'], true);
});

function artifactArchiveCommand(command) {
  const [seal, ...archive] = command.trim().split('\n');
  assert.equal(
    seal,
    'node scripts/ci/verify-meet-start-output.js seal apps/meet apps/meet/meet-artifact.json'
  );
  assert.equal(
    archive.at(-1),
    'tar -czf "$RUNNER_TEMP/meet-worker.tar.gz" -C apps/meet dist "$pointer" meet-artifact.json'
  );
  return archive.join('\n');
}

function runArchiveTool(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('Meet archives either selected pointer and excludes private source files', async () => {
  const seal = workflow.jobs.validate.steps.find((step) =>
    step.run?.includes('verify-meet-start-output.js seal')
  );
  const archive = artifactArchiveCommand(seal.run);
  const nativePointer = '.wrangler/deploy/config.json';
  const voidPointer = '.void/preview-deploy-config.json';
  for (const selected of [nativePointer, voidPointer]) {
    const snapshot = await mkdtemp(join(tmpdir(), 'meet-pointer-archive-'));
    try {
      const files = {
        'dist/index.js': 'export default {};\n',
        'meet-artifact.json': '{"source":"exact-fixture-source"}\n',
        [nativePointer]: '{"configPath":"../../dist/wrangler.json"}\n',
        '.env': 'PRIVATE_FIXTURE_ONLY\n',
        'wrangler.jsonc': 'PRIVATE_SOURCE_CONFIG\n',
        '.void/private.json': 'PRIVATE_VOID_STATE\n',
        '.wrangler/state/private.json': 'PRIVATE_WRANGLER_STATE\n',
      };
      if (selected === voidPointer) {
        files[voidPointer] = files[nativePointer];
        delete files[nativePointer];
      }
      for (const [file, content] of Object.entries(files)) {
        const destination = join(snapshot, 'apps/meet', file);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
      const options = {
        cwd: snapshot,
        env: { ...process.env, RUNNER_TEMP: snapshot },
      };
      runArchiveTool('sh', ['-eu', '-c', archive], options);
      const artifact = join(snapshot, 'meet-worker.tar.gz');
      const entries = runArchiveTool('tar', ['-tzf', artifact], options)
        .trim()
        .split('\n')
        .sort();
      assert.deepEqual(
        entries,
        ['dist/', 'dist/index.js', selected, 'meet-artifact.json'].sort()
      );
      for (const file of ['dist/index.js', selected, 'meet-artifact.json']) {
        assert.equal(
          runArchiveTool('tar', ['-xOzf', artifact, file], options),
          files[file]
        );
      }
    } finally {
      await rm(snapshot, { recursive: true, force: true });
    }
  }
});

test('source-only discovery excludes the emitted runtime while both artifact gates require it', () => {
  const runtimePath = 'scripts/ci/meet-cloudflare-render.runtime.mjs';
  assert.ok(existsSync(resolve(root, runtimePath)));
  assert.equal(
    existsSync(resolve(root, 'scripts/ci/meet-cloudflare-render.test.js')),
    false
  );
  const sourceTests = discoverScriptTests({
    repoRoot: root,
    roots: ['scripts/ci'],
    supplementalPaths: [],
  });
  assert.ok(sourceTests.includes('scripts/ci/meet-build-metadata.test.js'));
  assert.ok(
    sourceTests.includes('scripts/ci/verify-meet-start-output.test.js')
  );
  assert.ok(!sourceTests.includes(runtimePath));
  assert.ok(!sourceTests.includes('scripts/ci/meet-cloudflare-render.test.js'));
  for (const name of ['validate', 'deploy']) {
    const job = workflow.jobs[name];
    const probes = job.steps.filter(
      (step) => step.run === `node --test ${runtimePath}`
    );
    assert.equal(
      probes.length,
      1,
      `${name} must exercise emitted Worker runtime exactly once`
    );
    assert.equal(
      probes[0].if,
      undefined,
      `${name} runtime gate cannot be conditionally skipped`
    );
    assert.notEqual(probes[0]['continue-on-error'], true);
    assert.notEqual(job['continue-on-error'], true);
  }
  const typegen = workflow.jobs.validate.steps.find((step) =>
    step.run?.includes('wrangler types --config')
  );
  assert.match(typegen.run, /--env-interface CloudflareEnv(?:\s|$)/);
  assert.match(typegen.run, /--include-runtime=false(?:\s|$)/);
  for (const name of ['validate', 'deploy']) {
    const setup = workflow.jobs[name].steps.find(
      (step) => step.uses === './.github/actions/setup-bun-with-retry'
    );
    assert.equal(setup.with['bun-version'], '1.4.3');
  }
});

test('metadata source and environment identity participate in dependency cache inputs', () => {
  const turbo = JSON.parse(readFileSync(resolve(root, 'turbo.json'), 'utf8'));
  assert.ok(turbo.tasks.build.inputs.includes('$TURBO_DEFAULT$'));
  for (const key of [
    'PLATFORM_BUILD_ENVIRONMENT',
    'PLATFORM_BUILD_REF_NAME',
    'PLATFORM_BUILD_COMMIT_HASH',
  ]) {
    assert.ok(turbo.tasks.build.env.includes(key));
  }
  const fallback = readFileSync(
    resolve(root, 'packages/utils/src/generated/platform-build-metadata.ts'),
    'utf8'
  );
  assert.match(fallback, /PLATFORM_BUILD_METADATA/);
  assert.equal(
    workflow.jobs.validate.steps.find((step) =>
      step.with?.name?.startsWith('meet-worker-')
    ).with.name,
    'meet-worker-${{ github.sha }}'
  );
});

test('Meet workflow contracts run in a clean snapshot without Node dependencies', async () => {
  const snapshot = await mkdtemp(join(tmpdir(), 'meet-workflow-clean-'));
  try {
    for (const file of [
      'scripts/ci/meet-build-metadata.test.js',
      'scripts/ci/workflow-yaml-test-helper.js',
      'scripts/run-script-tests.js',
      'scripts/paused-runtimes.js',
      'scripts/ci/verify-meet-start-output.test.js',
      'scripts/ci/meet-cloudflare-render.runtime.mjs',
      '.github/workflows/meet-cloudflare.yaml',
      'turbo.json',
      'packages/utils/src/generated/platform-build-metadata.ts',
    ]) {
      const destination = join(snapshot, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(resolve(root, file), destination);
    }
    const env = { ...process.env, NODE_PATH: '' };
    // A nested Node test worker otherwise suppresses its standalone reporter.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=tap',
        '--test-name-pattern=Meet generates|only the production|metadata source|Meet qualifies|Meet archives|source-only discovery',
        join(snapshot, 'scripts/ci/meet-build-metadata.test.js'),
      ],
      {
        cwd: snapshot,
        env,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 128 * 1024,
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /pass 6/);
    assert.match(result.stdout, /fail 0/);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
});

test('Meet exact normalization helper and public probe changes select both workflow triggers', () => {
  for (const trigger of ['pull_request', 'push']) {
    for (const path of [
      'scripts/ci/meet-emitted-defaults.mjs',
      'scripts/ci/native-config-default-probe.mjs',
    ]) {
      assert.ok(workflow.on[trigger].paths.includes(path));
    }
  }
  const deploy = workflow.jobs.deploy.steps;
  const discovery = deploy.find(
    (step) => step.name === 'Discover restored native Void Start output'
  );
  assert.equal(
    discovery.run,
    'node scripts/ci/verify-meet-start-output.js config-restored apps/meet'
  );
  const validation = workflow.jobs.validate.steps;
  assert.ok(
    validation.some(
      (step) =>
        step.run?.includes(
          'node --test scripts/ci/meet-build-metadata.test.js'
        ) && step.run.includes('scripts/ci/verify-meet-start-output.test.js')
    )
  );
});
