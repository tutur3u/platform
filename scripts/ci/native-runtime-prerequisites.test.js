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
    'Acquire::Retries "3";\nAcquire::http::Timeout "20";\nAcquire::https::Timeout "20";\nAPT::Update::Error-Mode "any";\n'
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
    assert.equal(
      setup.with['working-directory'],
      `apps/${expression('inputs.app')}`
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
