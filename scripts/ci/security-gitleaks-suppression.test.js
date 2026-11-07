// Regression for REV-6456-1: a pull request must not be able to suppress a
// secret-scan finding with an inline `gitleaks:allow` comment, a checkout-local
// .gitleaksignore or a checkout-local .gitleaks.toml. The real "Scan for
// secrets" step from security-checks.yaml runs against a throwaway repository.
// Set GITLEAKS_BIN to run the real gitleaks binary (security-checks.yaml does
// after its checksum-verified install); otherwise a test double that mirrors
// gitleaks' config/ignore loading rules is used.
//
// The "secret" is a synthetic token matched only by a rule that exists in the
// test's own trusted config; it is not a credential format.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { env } = process;

const ruleId = 'ttr-synthetic-test-token';
const token = ['TTR', 'SYNTHETIC', 'TEST', 'TOKEN', '12345678'].join('_');
const trustedConfig = `[[rules]]
id = "${ruleId}"
description = "Synthetic token used only by the suppression regression"
regex = '''TTR_SYNTHETIC_TEST_TOKEN_[0-9]{8}'''
`;

// Plain-text extraction so the secrets job can run this suite with the real
// binary without installing Bun for the YAML helper.
function scanScript() {
  const lines = fs
    .readFileSync(
      path.resolve(__dirname, '../../.github/workflows/security-checks.yaml'),
      'utf8'
    )
    .split('\n');
  const name = lines.indexOf('      - name: Scan for secrets');
  const start = lines.indexOf('        run: |', name);
  assert.ok(name > 0 && start > name, 'Scan for secrets step not found');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}
const scanStep = { run: scanScript() };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commit(cwd, files, message) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '--quiet', '--no-verify', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function gitleaksBinary(directory) {
  const target = path.join(directory, 'gitleaks');
  if (env.GITLEAKS_BIN) {
    fs.symlinkSync(path.resolve(env.GITLEAKS_BIN), target);
  } else {
    fs.writeFileSync(
      target,
      `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'security-gitleaks-fake.js')}" "$@"\n`,
      { mode: 0o755 }
    );
  }
  return target;
}

// Base commit: trusted config and the summarizer. Head: a synthetic secret
// with an inline allow, then PR-controlled ignore and config files that try to
// suppress it by fingerprint and by allowlist.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-suppress-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const repo = path.join(root, 'repo');
  const temp = path.join(root, 'runner-temp');
  fs.mkdirSync(repo);
  fs.mkdirSync(temp);
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'Suppression Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const base = commit(
    repo,
    {
      '.github/security/gitleaks.toml': trustedConfig,
      'scripts/ci/security-scan-diff.js': fs.readFileSync(
        path.join(__dirname, 'security-scan-diff.js'),
        'utf8'
      ),
    },
    'base'
  );
  const leak = commit(
    repo,
    { 'config/leak.txt': `value = "${token}" # gitleaks:allow\n` },
    'add synthetic token'
  );
  const fingerprint = `${leak}:config/leak.txt:${ruleId}:1`;
  const head = commit(
    repo,
    {
      '.gitleaks.toml': `${trustedConfig}\n[allowlist]\nregexes = ['''TTR_SYNTHETIC''']\n`,
      '.gitleaksignore': `${fingerprint}\n`,
    },
    'try to suppress it'
  );
  gitleaksBinary(temp);
  return { base, fingerprint, head, repo, temp };
}

function runScan({ base, head, repo, temp }, extraEnv = {}) {
  const output = path.join(temp, 'step-output');
  fs.writeFileSync(output, '');
  return spawnSync('bash', ['-c', scanStep.run], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      BASE_SHA: base,
      DEEP: 'false',
      EVENT_NAME: 'pull_request',
      GITHUB_OUTPUT: output,
      GITHUB_SHA: head,
      RUNNER_TEMP: temp,
      ...extraEnv,
    },
  });
}

test('the double reproduces each suppression vector the step must defeat', (t) => {
  const { base, head, repo, temp } = fixture(t);
  const bin = path.join(temp, 'gitleaks');
  const report = path.join(temp, 'raw.json');
  const run = (args) => {
    const result = spawnSync(
      bin,
      [
        'git',
        ...args,
        '--log-opts',
        `${base}..${head}`,
        '--redact',
        '--no-banner',
        '--exit-code',
        '0',
        '--report-format',
        'json',
        '--report-path',
        report,
        '.',
      ],
      { cwd: repo, encoding: 'utf8', env: { ...process.env } }
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(fs.readFileSync(report, 'utf8') || '[]');
  };
  const config = path.join(temp, 'trusted.toml');
  fs.writeFileSync(config, trustedConfig);
  const empty = path.join(temp, 'empty-ignore');
  fs.writeFileSync(empty, '');
  // Without --ignore-gitleaks-allow the inline comment hides the token.
  assert.equal(
    run(['--config', config, '--gitleaks-ignore-path', empty]).length,
    0
  );
  // The checkout-local .gitleaksignore is read even with an explicit ignore
  // path, so the step must delete it rather than only point elsewhere.
  assert.equal(
    run([
      '--config',
      config,
      '--gitleaks-ignore-path',
      empty,
      '--ignore-gitleaks-allow',
    ]).length,
    0
  );
  fs.rmSync(path.join(repo, '.gitleaksignore'));
  assert.equal(
    run([
      '--config',
      config,
      '--gitleaks-ignore-path',
      empty,
      '--ignore-gitleaks-allow',
    ]).length,
    1
  );
  // Without --config, the checkout-local .gitleaks.toml allowlist applies.
  assert.equal(run(['--ignore-gitleaks-allow']).length, 0);
});

test('a pull request cannot suppress its own secret-scan finding', (t) => {
  const fx = fixture(t);
  const result = runScan(fx, {
    // A hostile environment must not redirect configuration either.
    GITLEAKS_CONFIG_TOML: '[extend]\nuseDefault = false\n',
  });
  const log = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1, log);
  assert.match(log, /1 possible secret\(s\); values are never printed\./u);
  assert.match(log, new RegExp(`Possible secret \\(${ruleId}\\)`, 'u'));
  assert.doesNotMatch(log, new RegExp(token, 'u'));
  // The checkout-local suppression files were removed before scanning.
  assert.equal(fs.existsSync(path.join(fx.repo, '.gitleaksignore')), false);
  assert.equal(fs.existsSync(path.join(fx.repo, '.gitleaks.toml')), false);
  const redacted = JSON.parse(
    fs.readFileSync(path.join(fx.temp, 'register-input/gitleaks.json'), 'utf8')
  );
  assert.deepEqual(
    redacted.map(({ file, rule }) => `${rule}@${file}`),
    [`${ruleId}@config/leak.txt`]
  );
});

test('only the trusted base ignore list can accept a finding', (t) => {
  const fx = fixture(t);
  // Recording the fingerprint in the base commit's .gitleaksignore (a
  // reviewed, already-merged decision) is the supported acceptance path.
  const repo = fx.repo;
  git(repo, 'checkout', '--quiet', fx.base);
  fs.writeFileSync(path.join(repo, '.gitleaksignore'), `${fx.fingerprint}\n`);
  git(repo, 'add', '.gitleaksignore');
  git(repo, 'commit', '--quiet', '--no-verify', '-m', 'accept');
  const acceptedBase = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '--quiet', fx.head);
  const result = runScan({ ...fx, base: acceptedBase });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /0 possible secret\(s\)/u);
});

test('the scan step pins trusted inputs and disables inline allows', () => {
  const run = scanStep.run;
  assert.match(run, /--ignore-gitleaks-allow/u);
  assert.match(run, /--config "\$RUNNER_TEMP\/gitleaks\.toml"/u);
  assert.match(run, /--gitleaks-ignore-path "\$RUNNER_TEMP\/gitleaksignore"/u);
  assert.match(run, /git show "\$trusted:\.gitleaksignore"/u);
  assert.match(run, /unset GITLEAKS_CONFIG GITLEAKS_CONFIG_TOML/u);
  // Removal happens before gitleaks runs.
  assert.ok(
    run.indexOf('rm -f .gitleaksignore .gitleaks.toml') <
      run.indexOf('"$RUNNER_TEMP/gitleaks" git')
  );
  assert.doesNotMatch(run, /config=\(\)/u);
});

const discordRuleId = 'discord-client-id';
const discordFingerprint =
  'cc59d0ba1527509297ec18ac6a1d559991f1fe64:apps/web/src/__tests__/discord-members-route.test.ts:discord-client-id:72';
const discordTrustedConfig = `[extend]
useDefault = true

[[rules]]
id = "${discordRuleId}"
description = "Identified a Discord client ID"
regex = '''(?i)[\\w.-]{0,50}?(?:discord)(?:[ \\t\\w.-]{0,20})[\\s'"]{0,3}(?:=|>|:{1,3}=|\\|\\||:|=>|\\?=|,)[\x60'"\\s=]{0,5}([0-9]{18})(?:[\x60'"\\s;]|\\\\[nr]|$)'''
`;

test('the #6990 discord-client-id fingerprint is suppressed while new findings fail', (t) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const ignoreFile = path.join(repoRoot, '.gitleaksignore');
  const ignoreContent = fs.readFileSync(ignoreFile, 'utf8');
  assert.ok(
    ignoreContent
      .split('\n')
      .some((line) => line.trim() === discordFingerprint),
    '.gitleaksignore must contain the reviewed #6990 Discord fingerprint'
  );

  // If the historical commit is present in the repository, prove that exactly
  // this fingerprint is suppressed by the trusted ignore, and flagged without it.
  let hasHistoricalCommit = false;
  try {
    git(repoRoot, 'cat-file', '-e', 'cc59d0ba1527509297ec18ac6a1d559991f1fe64');
    hasHistoricalCommit = true;
  } catch {
    hasHistoricalCommit = false;
  }

  if (hasHistoricalCommit) {
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gitleaks-discord-hist-')
    );
    t.after(() => fs.rmSync(temp, { force: true, recursive: true }));
    const bin = gitleaksBinary(temp);
    const report = path.join(temp, 'raw.json');
    const run = (args) => {
      const result = spawnSync(
        bin,
        [
          'git',
          ...args,
          '--log-opts',
          'fa47e8d24c03633e3dbee9f6ccb7d2f9540e3a8e..cc59d0ba1527509297ec18ac6a1d559991f1fe64',
          '--redact',
          '--no-banner',
          '--exit-code',
          '0',
          '--report-format',
          'json',
          '--report-path',
          report,
          temp,
        ],
        {
          cwd: temp,
          encoding: 'utf8',
          env: { ...process.env, GIT_DIR: path.join(repoRoot, '.git') },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(fs.readFileSync(report, 'utf8') || '[]');
    };

    const config = path.join(temp, 'trusted.toml');
    fs.writeFileSync(config, discordTrustedConfig);
    const emptyIgnore = path.join(temp, 'empty-ignore');
    fs.writeFileSync(emptyIgnore, '');

    // Without the ignore exception, the historical commit is detected as a finding.
    const unignored = run([
      '--config',
      config,
      '--gitleaks-ignore-path',
      emptyIgnore,
      '--ignore-gitleaks-allow',
    ]);
    assert.equal(unignored.length, 1);
    assert.equal(unignored[0].RuleID, discordRuleId);
    assert.equal(unignored[0].Fingerprint, discordFingerprint);
    assert.equal(
      unignored[0].File,
      'apps/web/src/__tests__/discord-members-route.test.ts'
    );
    assert.equal(unignored[0].StartLine, 72);

    // With the repository's .gitleaksignore, the fingerprint is suppressed.
    const ignored = run([
      '--config',
      config,
      '--gitleaks-ignore-path',
      ignoreFile,
      '--ignore-gitleaks-allow',
    ]);
    assert.equal(ignored.length, 0);
  }

  // A NEW discord-client-id finding elsewhere (different file or line) still fails.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-discord-new-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const repo = path.join(root, 'repo');
  const temp = path.join(root, 'runner-temp');
  fs.mkdirSync(repo);
  fs.mkdirSync(temp);
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'Discord Suppression Test');
  git(repo, 'config', 'commit.gpgsign', 'false');

  const base = commit(
    repo,
    {
      '.github/security/gitleaks.toml': discordTrustedConfig,
      '.gitleaksignore': `${discordFingerprint}\n`,
      'scripts/ci/security-scan-diff.js': fs.readFileSync(
        path.join(__dirname, 'security-scan-diff.js'),
        'utf8'
      ),
    },
    'base with discord fingerprint exception'
  );

  const head = commit(
    repo,
    {
      'apps/web/src/new-leak.ts':
        'const discordUserId = "987654321098765432";\n',
    },
    'add new discord finding elsewhere'
  );
  gitleaksBinary(temp);

  const result = runScan({ base, head, repo, temp });
  const log = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1, log);
  assert.match(log, /1 possible secret\(s\); values are never printed\./u);
  assert.match(log, /Possible secret \(discord-client-id\)/u);
  const redacted = JSON.parse(
    fs.readFileSync(path.join(temp, 'register-input/gitleaks.json'), 'utf8')
  );
  assert.deepEqual(
    redacted.map(({ file, rule }) => `${rule}@${file}`),
    ['discord-client-id@apps/web/src/new-leak.ts']
  );
});
