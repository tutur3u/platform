const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const root = path.resolve(__dirname, '../..');
const expression = (body) => `\${{ ${body} }}`;
const actionPath = '.github/actions/install-native-runtime-prerequisites';
const action = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
      path.join(root, actionPath, 'action.yml'),
    ],
    { encoding: 'utf8' }
  )
);
const install = action.runs.steps[0];

function runSetup(command, { sudoFailure = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-prereqs-'));
  const sources = path.join(dir, 'ubuntu.sources');
  const config = path.join(dir, 'apt.conf');
  const original = [
    'Types: deb',
    'URIs: mirror+file:/etc/apt/apt-mirrors.txt',
    'Suites: noble noble-updates noble-backports',
    'Components: main restricted universe multiverse',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    '',
    'Types: deb',
    'URIs: http://azure.archive.ubuntu.com/ubuntu',
    'Suites: noble-security',
    'Components: main restricted universe multiverse',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    '',
  ].join('\n');
  fs.writeFileSync(sources, original);
  fs.writeFileSync(
    path.join(dir, 'sudo'),
    `#!/bin/bash
set -euo pipefail
if [ "$SUDO_FAILURE" = 1 ]; then exit 23; fi
case "$1" in
  tee)
    [ "$#" = 2 ] && [ "$2" = /etc/apt/apt.conf.d/99-native-runtime ]
    cat > "$FIXTURE_CONFIG"
    ;;
  sed)
    [ "$#" = 4 ] && [ "$2" = -i ] && [ "$4" = /etc/apt/sources.list.d/ubuntu.sources ]
    sed "$3" "$FIXTURE_SOURCES" > "$FIXTURE_SOURCES.next"
    cat "$FIXTURE_SOURCES.next" > "$FIXTURE_SOURCES"
    ;;
  *) exit 99 ;;
esac
`,
    { mode: 0o755 }
  );
  const result = spawnSync(
    'bash',
    ['-e', '-o', 'pipefail', '-c', install.run],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        SETUP_DIRECTORY: dir,
        SETUP_COMMAND: command,
        FIXTURE_CONFIG: config,
        FIXTURE_SOURCES: sources,
        SUDO_FAILURE: sudoFailure ? '1' : '0',
      },
      encoding: 'utf8',
      timeout: 5_000,
    }
  );
  return { dir, sources, config, original, result };
}

test('setup preserves Ubuntu signing and suites, bounds apt transport and runs the caller', () => {
  const fixture = runSetup('printf "%s" "$PWD"');
  assert.equal(fixture.result.status, 0, fixture.result.stderr);
  assert.equal(fixture.result.stdout, fixture.dir);
  assert.equal(
    fs.readFileSync(fixture.sources, 'utf8'),
    fixture.original.replace(
      /^URIs:.*$/gm,
      'URIs: https://archive.ubuntu.com/ubuntu'
    )
  );
  assert.equal(
    fs.readFileSync(fixture.config, 'utf8'),
    [
      'Acquire::Retries "3";',
      'Acquire::http::Timeout "20";',
      'Acquire::https::Timeout "20";',
      'APT::Update::Error-Mode "any";',
      // Vendor feeds (packages.microsoft.com) must not gate browser deps.
      'Dir::Etc::sourcelist "/etc/apt/sources.list.d/ubuntu.sources";',
      'Dir::Etc::sourceparts "-";',
      '',
    ].join('\n')
  );
});

test('prerequisite failure remains fatal without replaying the caller command', () => {
  const fixture = runSetup('printf attempted >> attempts; exit 37');
  assert.equal(fixture.result.status, 37, fixture.result.stderr);
  assert.equal(
    fs.readFileSync(path.join(fixture.dir, 'attempts'), 'utf8'),
    'attempted'
  );
});

test('apt configuration failure prevents the prerequisite command', () => {
  const fixture = runSetup('printf must-not-run', { sudoFailure: true });
  assert.equal(fixture.result.status, 23, fixture.result.stderr);
  assert.equal(fixture.result.stdout, '');
});

test('both native jobs retain bounded setup and mandatory runtime acceptance', () => {
  const workflow = readWorkflow('native-start-app.yaml');
  for (const job of Object.values(workflow.jobs)) {
    const setupIndex = job.steps.findIndex(
      (step) => step.name === 'Install runtime prerequisites'
    );
    const setup = job.steps[setupIndex];
    assert.equal(setup.uses, `./${actionPath}`);
    assert.equal(setup['timeout-minutes'], 10);
    assert.equal(setup.if, "env.RUNTIME_SETUP_COMMAND != ''");
    assert.equal(setup.with.command, expression('env.RUNTIME_SETUP_COMMAND'));
    // An empty app-dir resolves to apps/<app>.
    assert.equal(
      setup.with['working-directory'],
      expression("inputs.app-dir || format('apps/{0}', inputs.app)")
    );
    assert.equal(setup['continue-on-error'], undefined);
    const runtime = job.steps[setupIndex + 1];
    assert.equal(runtime['timeout-minutes'], 4);
    assert.equal(runtime.run, 'bash -c "$RUNTIME_COMMAND"');
    assert.equal(runtime['continue-on-error'], undefined);
  }
  const finance = readWorkflow('finance-cloudflare.yaml');
  for (const event of ['pull_request', 'push']) {
    assert.ok(finance.on[event].paths.includes(`${actionPath}/**`));
    assert.ok(
      finance.on[event].paths.includes(
        'scripts/ci/native-runtime-prerequisites.test.js'
      )
    );
  }
  for (const job of Object.values(finance.jobs)) {
    if (!job.uses?.endsWith('/native-start-app.yaml')) continue;
    assert.equal(
      job.with['runtime-setup-command'],
      'cd ../web && bun x --no-install playwright install --with-deps chromium'
    );
  }
});

test('Pay keeps browser setup outside runtime acceptance', () => {
  const pay = readWorkflow('pay-cloudflare.yaml');
  assert.equal(
    pay.jobs.native.with['runtime-setup-command'],
    'cd ../web && bun x --no-install playwright install --with-deps chromium'
  );
  assert.equal(
    pay.jobs.native.with['runtime-command'],
    'node --test --test-concurrency=1 cloudflare/*.runtime.mjs'
  );
  for (const event of ['pull_request', 'push']) {
    assert.ok(pay.on[event].paths.includes(`${actionPath}/**`));
    assert.ok(
      pay.on[event].paths.includes(
        'scripts/ci/native-runtime-prerequisites.test.js'
      )
    );
  }
});

test('native build identity records the environment its caller declares', () => {
  const workflow = readWorkflow('native-start-app.yaml');
  const input = workflow.on.workflow_call.inputs['build-environment'];
  assert.equal(input.default, 'preview');
  const validate = workflow.jobs.validate;
  assert.equal(
    validate.env.BUILD_ENVIRONMENT,
    '${{ inputs.build-environment }}'
  );
  const admit = validate.steps.find(
    (step) => step.name === 'Admit the native profile selector'
  );
  assert.ok(
    admit.run.includes('[[ "$BUILD_ENVIRONMENT" =~ ^(preview|production)$ ]]')
  );
  const identity = validate.steps.find(
    (step) => step.name === 'Generate exact-checkout build identity'
  );
  assert.equal(
    identity.env.PLATFORM_BUILD_ENVIRONMENT,
    '${{ env.BUILD_ENVIRONMENT }}'
  );

  // A caller that pins the production native profile records production in
  // /api/build-info, and only a production profile may claim production.
  // Matrix callers derive it from the profile: production only for the
  // production profile, preview for every other profile.
  const matrixEnvironment = expression(
    "matrix.profile == 'production' && 'production' || 'preview'"
  );
  const resolveMatrixEnvironment = (environment, profile) => {
    assert.equal(environment, matrixEnvironment);
    return profile === 'production' ? 'production' : 'preview';
  };
  const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
  const callers = [];
  const matrixCallers = [];
  for (const name of fs.readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(name) || name === 'native-start-app.yaml') continue;
    const caller = readWorkflow(name);
    for (const [jobName, job] of Object.entries(caller.jobs ?? {})) {
      if (!job.uses?.endsWith('/native-start-app.yaml')) continue;
      const profile = job.with?.['profile-env'] ?? '';
      const environment = job.with?.['build-environment'];
      const label = `${name}:${jobName}`;
      if (/_NATIVE_PROFILE=production$/.test(profile)) {
        callers.push(label);
        assert.equal(environment, 'production', label);
      } else if (
        profile.endsWith(`_NATIVE_PROFILE=${expression('matrix.profile')}`)
      ) {
        matrixCallers.push(label);
        const profiles = job.strategy?.matrix?.profile ?? [];
        assert.ok(profiles.includes('production'), label);
        assert.equal(environment, matrixEnvironment, label);
        for (const value of profiles) {
          assert.equal(
            resolveMatrixEnvironment(environment, value),
            value === 'production' ? 'production' : 'preview',
            `${label}:${value}`
          );
        }
      } else {
        assert.notEqual(environment, 'production', label);
      }
    }
  }
  assert.deepEqual(callers.sort(), [
    'finance-cloudflare.yaml:native-production',
    'playground-cloudflare.yaml:native',
    'shortener-cloudflare.yaml:native-production',
  ]);
  assert.deepEqual(matrixCallers.sort(), [
    'external-cloudflare.yaml:build',
    'forms-cloudflare.yaml:native',
    'inventory-cloudflare.yaml:native',
    'mind-cloudflare.yaml:native',
    'nova-cloudflare.yaml:native',
  ]);
  assert.equal(
    resolveMatrixEnvironment(matrixEnvironment, 'production'),
    'production'
  );
  for (const value of ['staging', 'preview', 'development', '']) {
    assert.equal(resolveMatrixEnvironment(matrixEnvironment, value), 'preview');
  }
});
