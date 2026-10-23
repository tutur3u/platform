// Regressions for REV-6456-5/6: the secret-scan, dependency-audit and CodeQL
// gates must never let pull request code decide pass or fail. The real step
// scripts run against throwaway repositories whose base lacks the trusted
// helper (the bootstrap case) while the checkout carries a hostile copy that
// would always pass, and the dependency audit gets a hostile `bun` on PATH
// plus checkout-local registry configuration.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const severityCases = require('./fixtures/codeql-severity-cases.js');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const token = ['TTR', 'SYNTHETIC', 'TEST', 'TOKEN', '12345678'].join('_');
const trustedConfig = `[[rules]]
id = "ttr-synthetic-test-token"
description = "Synthetic token used only by trusted-helper regressions"
regex = '''TTR_SYNTHETIC_TEST_TOKEN_[0-9]{8}'''
`;
// A checkout helper that would hide every finding if it were ever executed.
const hostileHelper =
  "require('node:fs').writeFileSync('/dev/null', '');\nprocess.exit(0);\n";

function stepScript(file, stepName) {
  const lines = fs
    .readFileSync(path.join(workflowsDir, file), 'utf8')
    .split('\n');
  const name = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.ok(name > 0, `${file}: step ${stepName} not found`);
  const start = lines.findIndex(
    (line, index) => index > name && line.trim() === 'run: |'
  );
  const indent = lines[start].indexOf('run:') + 2;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && line.length - line.trimStart().length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

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

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-helpers-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const repo = path.join(root, 'repo');
  const temp = path.join(root, 'runner-temp');
  const bin = path.join(root, 'hostile-bin');
  for (const dir of [repo, temp, bin]) fs.mkdirSync(dir);
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'Trusted Helper Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  // A PATH-shadowing `bun` that reports no advisories.
  fs.writeFileSync(path.join(bin, 'bun'), '#!/bin/sh\necho "{}"\n', {
    mode: 0o755,
  });
  return { bin, repo, root, temp };
}

function run(script, { bin, repo, temp }, env) {
  const output = path.join(temp, 'step-output');
  fs.writeFileSync(output, '');
  return spawnSync('bash', ['-c', script], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      HOME: process.env.HOME,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: temp,
      ...env,
    },
  });
}

test('secret scan fails closed when the base lacks the summarizer', (t) => {
  const box = sandbox(t);
  const base = commit(
    box.repo,
    { '.github/security/gitleaks.toml': trustedConfig },
    'base without summarizer'
  );
  const clean = commit(
    box.repo,
    { 'scripts/ci/security-scan-diff.js': hostileHelper },
    'hostile summarizer'
  );
  const leaked = commit(
    box.repo,
    { 'config/leak.txt': `value = "${token}"\n` },
    'synthetic token'
  );
  fs.writeFileSync(
    path.join(box.temp, 'gitleaks'),
    `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'security-gitleaks-fake.js')}" "$@"\n`,
    { mode: 0o755 }
  );
  const script = stepScript('security-checks.yaml', 'Scan for secrets');
  const scan = (head, env = {}) =>
    run(script, box, {
      BASE_SHA: base,
      DEEP: 'false',
      EVENT_NAME: 'pull_request',
      GITHUB_SHA: head,
      ...env,
    });

  const blocked = scan(leaked);
  assert.notEqual(blocked.status, 0, blocked.stdout + blocked.stderr);
  assert.match(blocked.stdout, /trusted summarizer is unavailable/u);
  assert.match(blocked.stdout, /Possible secret \(ttr-synthetic-test-token\)/u);
  assert.doesNotMatch(blocked.stdout + blocked.stderr, new RegExp(token, 'u'));

  const passed = scan(clean);
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);

  // The register is built only from main's own summarizer.
  const register = scan(base, { EVENT_NAME: 'schedule' });
  assert.notEqual(register.status, 0);
  assert.match(register.stdout, /refusing to build the register/u);
});

test('dependency audit ignores checkout bun, config and differ', (t) => {
  const box = sandbox(t);
  const manifest = JSON.stringify({ name: 'fixture', private: true });
  const base = commit(
    box.repo,
    { 'bun.lock': '{}\n', 'package.json': `${manifest}\n` },
    'base without differ'
  );
  const head = commit(
    box.repo,
    {
      '.npmrc': 'registry=https://registry.attacker.invalid/\n',
      'bunfig.toml':
        '[install]\nregistry = "https://registry.attacker.invalid/"\n',
      'scripts/ci/security-scan-diff.js': hostileHelper,
    },
    'hostile checkout'
  );
  // The verified binary: records where it ran and returns FAKE_AUDIT.
  const seen = path.join(box.root, 'seen');
  const verified = path.join(box.root, 'verified-bun');
  fs.writeFileSync(
    verified,
    `#!/bin/sh\nls -A >> "${seen}"\necho "registry=$BUN_CONFIG_REGISTRY" >> "${seen}"\nprintf '%s' "$FAKE_AUDIT"\n`,
    { mode: 0o755 }
  );
  const script = stepScript(
    'security-checks.yaml',
    'Audit locked dependencies'
  );
  const audit = (advisories) =>
    run(script, box, {
      BASE_SHA: base,
      BUN_BIN: verified,
      BUN_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
      EVENT_NAME: 'pull_request',
      FAKE_AUDIT: JSON.stringify(advisories),
      GITHUB_SHA: head,
    });

  const high = { lodash: [{ severity: 'high', url: 'https://x.invalid/1' }] };
  const blocked = audit(high);
  assert.notEqual(blocked.status, 0, blocked.stdout + blocked.stderr);
  assert.match(blocked.stdout, /trusted differ is unavailable/u);
  const listing = fs.readFileSync(seen, 'utf8');
  assert.doesNotMatch(listing, /bunfig\.toml|\.npmrc|scripts/u);
  assert.match(listing, /registry=https:\/\/registry\.npmjs\.org\//u);

  const low = { lodash: [{ severity: 'low', url: 'https://x.invalid/2' }] };
  const passed = audit(low);
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);

  // Unparseable scanner output never passes.
  const broken = run(script, box, {
    BASE_SHA: base,
    BUN_BIN: path.join(box.bin, 'missing-bun'),
    EVENT_NAME: 'pull_request',
    GITHUB_SHA: head,
  });
  assert.notEqual(broken.status, 0);
});

test('CodeQL gate fails closed when the base lacks the gate script', (t) => {
  const box = sandbox(t);
  commit(box.repo, { 'README.md': 'base\n' }, 'base without gate');
  commit(
    box.repo,
    { 'scripts/ci/codeql-new-alerts.js': hostileHelper },
    'hostile gate'
  );
  const sarifDir = path.join(box.temp, 'codeql-sarif');
  const script = stepScript(
    'codeql.yml',
    'Fail on new high or critical results'
  );
  const shared = JSON.parse(fs.readFileSync(severityCases.fixture, 'utf8'));
  const gate = (ruleId) => {
    fs.rmSync(sarifDir, { force: true, recursive: true });
    fs.mkdirSync(sarifDir);
    if (ruleId) {
      const sarif = structuredClone(shared);
      sarif.runs[0].results = [{ ruleId }];
      fs.writeFileSync(
        path.join(sarifDir, 'javascript.sarif'),
        JSON.stringify(sarif)
      );
    }
    return run(script, box, { CATEGORY: '/language:javascript' });
  };

  // REV-6456-12/14: the shared fixture's expectations hold for the bootstrap
  // jq gate exactly as for codeql-new-alerts.js (security-scanners.test.js).
  for (const [ruleId, blocks] of Object.entries(severityCases.blocking)) {
    const result = gate(ruleId);
    assert.equal(
      result.status !== 0,
      blocks,
      `${ruleId}: ${result.stdout}${result.stderr}`
    );
  }
  assert.notEqual(gate(null).status, 0, 'missing SARIF output fails');
  // Public logs carry counts only, never rule IDs, paths or messages.
  const all = gate('js/string-high');
  assert.match(
    all.stdout,
    /1 high\/critical CodeQL result\(s\) \(0 critical, 1 high\)/u
  );
  assert.doesNotMatch(all.stdout + all.stderr, /js\/|file=|\.sarif/u);
});

function outputs(temp) {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(temp, 'step-output'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(/=(.*)/su).slice(0, 2))
  );
}

test('scan scope comes from the base, or runs every scan', (t) => {
  const scopeFiles = [
    'scripts/ci/github-deployment-markers.ts',
    'scripts/ci/resolve-changed-files-core.ts',
    'scripts/ci/resolve-changed-files.ts',
    'scripts/ci/security-paths.js',
  ];
  // A checkout scope script that would switch every gate off.
  const hostileScope = `require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT,
  'codeql_languages=[]\\ncodeql=false\\ndependencies=false\\nworkflows=false\\n');\n`;
  const { codeqlLanguages } = require('./security-paths.js').classifyScope(
    null,
    { full: true }
  );
  for (const [file, selectName] of [
    ['security-checks.yaml', 'Select scans'],
    ['codeql.yml', 'Select CodeQL languages'],
  ]) {
    const load = stepScript(file, 'Load trusted scope scripts');
    const select = stepScript(file, selectName);
    assert.match(
      select,
      new RegExp(
        `codeql_languages=${JSON.stringify(codeqlLanguages).replace(/[[\]]/gu, '\\$&')}`,
        'u'
      ),
      `${file}: fallback lists every CodeQL language`
    );
    for (const baseHasScope of [true, false]) {
      const box = sandbox(t);
      const base = commit(
        box.repo,
        Object.fromEntries(
          (baseHasScope ? scopeFiles : ['README.md']).map((name) => [
            name,
            name === 'README.md'
              ? 'base\n'
              : fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8'),
          ])
        ),
        'base'
      );
      const head = commit(
        box.repo,
        {
          'package.json': '{}\n',
          'scripts/ci/security-paths.js': hostileScope,
        },
        'hostile scope'
      );
      const env = {
        BASE_SHA: base,
        EVENT_NAME: 'pull_request',
        GITHUB_SHA: head,
      };
      const loaded = run(load, box, env);
      assert.equal(loaded.status, 0, loaded.stdout + loaded.stderr);
      const { available, dir = '' } = outputs(box.temp);
      assert.equal(available, String(baseHasScope));
      const changed = path.join(box.root, 'changed');
      fs.writeFileSync(changed, 'package.json\n');
      const selected = run(select, box, {
        AVAILABLE: available,
        CHANGED_FILES_FILE: changed,
        GITHUB_EVENT_NAME: 'pull_request',
        TRUSTED_SCOPE: dir,
      });
      assert.equal(selected.status, 0, selected.stdout + selected.stderr);
      const scope = outputs(box.temp);
      assert.equal(scope.dependencies, 'true', `${file} base=${baseHasScope}`);
      if (!baseHasScope) {
        assert.equal(scope.workflows, 'true');
        assert.equal(scope.codeql, 'true');
      }
    }
  }
});
