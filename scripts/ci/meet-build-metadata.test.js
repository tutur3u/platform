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
const runtimeGateCommands = {
  validate:
    'meet_status=0\nTMPDIR="$RUNNER_TEMP" node scripts/ci/meet-native-launcher.mjs "$SOURCE_SHA" || meet_status=$?\nsdk_status=0\nGITHUB_SHA="$SOURCE_SHA" node --test --test-concurrency=1 scripts/ci/native-wrangler-runtime.test.mjs scripts/ci/native-wrangler-runtime.runtime.mjs || sdk_status=$?\ntest "$meet_status" -eq 0\ntest "$sdk_status" -eq 0\n',
  deploy:
    'TMPDIR="$RUNNER_TEMP" node scripts/ci/meet-native-launcher.mjs "$SOURCE_SHA"',
};

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
  assert.equal(env.PLATFORM_BUILD_COMMIT_HASH, '${{ env.SOURCE_SHA }}');
});

test('only the production deploy verifies canonical identity before its success marker', () => {
  assert.equal(
    workflow.jobs.deploy.if,
    "github.ref == 'refs/heads/production' && needs.production-policy.outputs.allowed == 'true'"
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
  assertMeetArtifactActors(validate);
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

function uniqueActor(steps, name) {
  const matches = steps.filter((step) => step.name === name);
  assert.equal(matches.length, 1, `unique actor: ${name}`);
  return matches[0];
}
function assertDebugMetadata(step, app, source) {
  assert.equal(step.env.WORKFLOW_SOURCE_SHA, '${{ github.workflow_sha }}');
  const lines = step.run.trim().split('\n');
  const metadata = lines.filter((line) => line.startsWith('printf '));
  assert.equal(metadata.length, 1);
  assert.equal(
    metadata[0],
    `printf 'classification=DEBUG sealed source; NOT qualified release\\nexpected_source_sha=%s\\ncheckout_head=%s\\ngithub_sha=%s\\nworkflow_source_sha=%s\\nevent_name=%s\\nrun_id=%s\\nrun_attempt=%s\\n' "${source}" "$(git rev-parse HEAD)" "$GITHUB_SHA" "$WORKFLOW_SOURCE_SHA" "$GITHUB_EVENT_NAME" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" > "$RUNNER_TEMP/${app}-debug-sealed-source.txt"`
  );
  assert.equal(lines[0], `test "$(git rev-parse HEAD)" = "${source}"`);
  assert.equal(
    lines.at(-1),
    `sha256sum "$RUNNER_TEMP/${app}-debug-sealed-source.tar.gz" "apps/meet/meet-artifact.json" >> "$RUNNER_TEMP/${app}-debug-sealed-source.txt"`
  );
}
function assertMeetArtifactActors(steps) {
  const names = [
    'Build the frontend for Workers',
    'Discover and verify native Void Start output',
    'Generate emitted Worker binding types',
    'Check Worker binding types',
    'Seal exact-SHA frontend artifact',
    'Verify emitted Start SSR, auth, cookies, rewrites and Live guards',
    'Validate both Worker bundles',
    'Verify and pack accepted exact-SHA frontend artifact',
  ];
  const actors = names.map((name) => uniqueActor(steps, name));
  for (let i = 0; i < actors.length; i++) {
    assert.equal(actors[i].if, undefined);
    assert.notEqual(actors[i]['continue-on-error'], true);
    if (i) assert.ok(steps.indexOf(actors[i]) > steps.indexOf(actors[i - 1]));
  }
  assert.match(actors[0].with.command, /bun run build:cloudflare/);
  assert.equal(actors[1].id, 'meet-output');
  assert.match(actors[2].run, /wrangler types --config/);
  const seal = actors[4];
  assert.equal(seal.id, 'meet-canonical-seal');
  assert.equal(
    seal.run.trim(),
    'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"\nGITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js seal apps/meet apps/meet/meet-artifact.json'
  );
  assert.equal(
    steps.filter((step) =>
      step.run?.includes('verify-meet-start-output.js seal')
    ).length,
    1
  );
  assert.equal(actors[5].run, runtimeGateCommands.validate);
  assert.match(
    actors[6].run,
    /^\(cd apps\/meet && node \.\.\/\.\.\/scripts\/ci\/meet-dry-run-scratch\.mjs "\$SOURCE_SHA"\)$/m
  );
  assert.match(
    actors[6].run,
    /wrangler deploy --dry-run -c apps\/meet-realtime\/wrangler.jsonc/
  );
  artifactArchiveCommand(actors[7].run);
  const uploads = steps.filter(
    (step) => step.with?.path === '${{ runner.temp }}/meet-worker.tar.gz'
  );
  assert.equal(uploads.length, 1);
  assert.match(
    uploads[0].uses ?? '',
    /^actions\/upload-artifact@[a-f0-9]{40}$/
  );
  assert.equal(uploads[0].run, undefined);
  assert.ok(steps.indexOf(uploads[0]) > steps.indexOf(actors[7]));
  assert.equal(uploads[0].if, undefined);
  const debug = uniqueActor(
    steps,
    'Verify and pack failed-job sealed source for debugging'
  );
  assert.equal(debug.id, 'meet-debug-pack');
  assert.equal(
    debug.if,
    "${{ failure() && steps.meet-canonical-seal.outcome == 'success' }}"
  );
  assertDebugMetadata(debug, 'meet', '$SOURCE_SHA');
  const evidence = debug.run
    .trim()
    .split('\n')
    .filter((line) => /^(GITHUB_SHA=|tar |cmp )/.test(line));
  assert.deepEqual(evidence, [
    'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify apps/meet apps/meet/meet-artifact.json',
    'tar -czf "$RUNNER_TEMP/meet-debug-sealed-source.tar.gz" -C apps/meet dist "$pointer" meet-artifact.json',
    'tar -xzf "$RUNNER_TEMP/meet-debug-sealed-source.tar.gz" -C "$verify_dir"',
    'cmp "apps/meet/meet-artifact.json" "$verify_dir/meet-artifact.json"',
    'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify "$verify_dir" "$verify_dir/meet-artifact.json"',
    'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify apps/meet apps/meet/meet-artifact.json',
  ]);
  const upload = uniqueActor(
    steps,
    'Retain failed-job sealed source for debugging'
  );
  assert.equal(
    upload.if,
    "${{ failure() && steps.meet-canonical-seal.outcome == 'success' && steps.meet-debug-pack.outcome == 'success' }}"
  );
  assert.equal(upload.with['retention-days'], 3);
}

test('Meet artifact actor guards reject removed, moved, duplicate and forged evidence', () => {
  const original = workflow.jobs.validate.steps;
  assertMeetArtifactActors(original);
  const mutations = [
    (steps) =>
      steps.splice(
        steps.findIndex((s) => s.id === 'meet-canonical-seal'),
        1
      ),
    (steps) =>
      steps.push(uniqueActor(steps, 'Seal exact-SHA frontend artifact')),
    (steps) => {
      const i = steps.findIndex((s) => s.id === 'meet-canonical-seal');
      steps.push(...steps.splice(i, 1));
    },
    (steps) => {
      uniqueActor(
        steps,
        'Verify and pack accepted exact-SHA frontend artifact'
      ).run =
        'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js seal apps/meet apps/meet/meet-artifact.json';
    },
    (steps) => {
      uniqueActor(
        steps,
        'Verify and pack failed-job sealed source for debugging'
      ).env.WORKFLOW_SOURCE_SHA = '${{ github.sha }}';
    },
    (steps) => {
      const a = uniqueActor(
        steps,
        'Verify and pack failed-job sealed source for debugging'
      );
      a.run = a.run.replace('"$GITHUB_EVENT_NAME"', '"$GITHUB_SHA"');
    },
    (steps) => {
      const a = uniqueActor(
        steps,
        'Verify and pack failed-job sealed source for debugging'
      );
      a.run = a.run.replace('sha256sum', 'echo');
    },
  ];
  mutations.push((steps) => {
    const actor = uniqueActor(
      steps,
      'Verify and pack failed-job sealed source for debugging'
    );
    actor.run = actor.run.replace(
      'cmp "apps/meet/meet-artifact.json"',
      'echo "apps/meet/meet-artifact.json"'
    );
  });
  mutations.push((steps) => {
    const actor = uniqueActor(
      steps,
      'Verify and pack accepted exact-SHA frontend artifact'
    );
    actor.run = actor.run.replace('"$SOURCE_SHA"', '"forged-source"');
  });
  mutations.push((steps) => {
    const upload = steps.find(
      (step) => step.with?.path === '${{ runner.temp }}/meet-worker.tar.gz'
    );
    delete upload.uses;
    upload.run = 'echo omitted-upload';
  });
  for (const mutate of mutations) {
    const steps = structuredClone(original);
    mutate(steps);
    assert.throws(() => assertMeetArtifactActors(steps));
  }
});

function artifactArchiveCommand(command) {
  const [head, verify, ...archive] = command.trim().split('\n');
  assert.equal(head, 'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
  assert.equal(
    verify,
    'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify apps/meet apps/meet/meet-artifact.json'
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
  const pack = uniqueActor(
    workflow.jobs.validate.steps,
    'Verify and pack accepted exact-SHA frontend artifact'
  );
  const archive = artifactArchiveCommand(pack.run);
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

test('source-only discovery excludes the emitted runtime while both artifact gates require it', async () => {
  const runtimePath = 'scripts/ci/meet-cloudflare-render.runtime.mjs';
  assert.ok(existsSync(resolve(root, runtimePath)));
  const launcherPath = 'scripts/ci/meet-native-launcher.mjs';
  assert.ok(existsSync(resolve(root, launcherPath)));
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
  assert.ok(!sourceTests.includes(launcherPath));
  assert.ok(!sourceTests.includes('scripts/ci/meet-cloudflare-render.test.js'));
  const assertRuntimeGate = (name, job) => {
    const probes = job.steps.filter(
      (step) => step.run === runtimeGateCommands[name]
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
  };
  for (const name of ['validate', 'deploy']) {
    const job = workflow.jobs[name];
    assertRuntimeGate(name, job);
    const command = runtimeGateCommands[name];
    const gate = job.steps.find((step) => step.run === command);
    const withoutGate = job.steps.filter((step) => step !== gate);
    const rejectedJobs = [
      { ...job, steps: withoutGate },
      { ...job, steps: [...job.steps, gate] },
      { ...job, 'continue-on-error': true },
      ...[
        { ...gate, if: 'always()' },
        { ...gate, run: `GITHUB_SHA="$SOURCE_SHA" node --test ${runtimePath}` },
        { ...gate, 'continue-on-error': true },
        { ...gate, run: command.replace(launcherPath, '') },
        {
          ...gate,
          run: command.replace(launcherPath, `${launcherPath} ${launcherPath}`),
        },
        { ...gate, run: `${command} --test-reporter=spec` },
        {
          ...gate,
          run: runtimeGateCommands[name === 'validate' ? 'deploy' : 'validate'],
        },
      ].map((step) => ({ ...job, steps: [...withoutGate, step] })),
    ];
    for (const rejectedJob of rejectedJobs) {
      assert.throws(
        () => assertRuntimeGate(name, rejectedJob),
        assert.AssertionError
      );
    }
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
    assert.equal(setup.with['bun-version'], '1.4.4');
  }
  const sink = await mkdtemp(join(tmpdir(), 'meet-launcher-command-'));
  try {
    await writeFile(
      join(sink, 'node'),
      '#!/bin/sh\nprintf "%s\\n" "$1" >> "$MEET_INVOCATIONS"\ncase "$1" in scripts/ci/meet-native-launcher.mjs) exit "$MEET_EXIT" ;; --test) exit "$SDK_EXIT" ;; *) exit 99 ;; esac\n',
      { mode: 0o700 }
    );
    for (const [meetExit, sdkExit] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const calls = join(sink, `calls-${meetExit}-${sdkExit}`);
      const result = spawnSync(
        'bash',
        ['-eu', '-c', runtimeGateCommands.validate],
        {
          cwd: sink,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${sink}:${process.env.PATH}`,
            RUNNER_TEMP: sink,
            SOURCE_SHA: 'a'.repeat(40),
            MEET_INVOCATIONS: calls,
            MEET_EXIT: String(meetExit),
            SDK_EXIT: String(sdkExit),
          },
        }
      );
      assert.equal(result.status, meetExit || sdkExit ? 1 : 0, result.stderr);
      assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [
        launcherPath,
        '--test',
      ]);
    }
  } finally {
    await rm(sink, { recursive: true, force: true });
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
    'meet-worker-${{ env.SOURCE_SHA }}'
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
      'scripts/ci/meet-native-launcher.mjs',
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
      'scripts/ci/meet-native-*.mjs',
      'scripts/ci/native-wrangler-evidence.mjs',
      'scripts/ci/native-wrangler-diagnostics.mjs',
      'scripts/ci/native-wrangler-observable.mjs',
      'scripts/ci/native-wrangler-summary.mjs',
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
    'GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js config-restored apps/meet'
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

test('Meet builds with production Supabase values only on the production ref', () => {
  // The validate gate admits only the sealed public CI fixture .dev.vars, so main
  // pushes must build with the same placeholders as pull requests.
  const build = workflow.jobs.validate.steps.find(
    (step) => step.id === 'meet-frontend-build'
  );
  assert.deepEqual(
    {
      url: build.env.NEXT_PUBLIC_SUPABASE_URL,
      key: build.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    {
      url: "${{ github.ref != 'refs/heads/production' && 'https://meet-ci.supabase.invalid' || secrets.PRODUCTION_SUPABASE_URL }}",
      key: "${{ github.ref != 'refs/heads/production' && 'sb_publishable_meet_ci_placeholder' || secrets.PRODUCTION_SUPABASE_PUBLISHABLE_KEY }}",
    }
  );
});
