const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findWorkflowScanningTests } = require('./workflow-scanners');

const ROOT = path.resolve(__dirname, '../..');

test('finds every scripts/ci test that scans all workflows or actions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-scanners-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
    const write = (name, body) =>
      fs.writeFileSync(path.join(dir, 'scripts/ci', name), body);
    write('secret-scope.test.js', 'const w = readAllWorkflows(undefined);');
    write('runner.test.mjs', 'readAllWorkflows ( dir )');
    write(
      'action-pins.test.js',
      "for (const f of fs.readdirSync(path.join(root, '.github', 'actions'))) {}"
    );
    write(
      'injection.test.js',
      'fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yaml"))'
    );
    write(
      'bot.test.js',
      "const inventory = require('./tuturuuu-bot-inventory');"
    );
    write(
      'policy.test.js',
      "const policy = require('./self-hosted-policy.js');"
    );
    write(
      'backticks.test.js',
      'fs.readdirSync(path.join(root, `.github`, `workflows`))'
    );
    // Co-occurrence: listing another directory next to one workflow path is
    // selected on purpose (over-selection is cheaper than a missed scanner).
    write(
      'cooccurs.test.js',
      "fs.readdirSync(migrations); read('.github/workflows/one.yaml')"
    );
    write('single.test.js', "readWorkflow('one.yaml')");
    write('lists-other.test.js', "fs.readdirSync('apps')");
    write('helper.js', 'readAllWorkflows()');
    // Paused runtimes stay out of the gate, as in the root script suite.
    write('rust-verification-workflow.test.js', 'readAllWorkflows()');
    assert.deepEqual(findWorkflowScanningTests(dir), [
      'scripts/ci/action-pins.test.js',
      'scripts/ci/backticks.test.js',
      'scripts/ci/bot.test.js',
      'scripts/ci/cooccurs.test.js',
      'scripts/ci/injection.test.js',
      'scripts/ci/policy.test.js',
      'scripts/ci/runner.test.mjs',
      'scripts/ci/secret-scope.test.js',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing scripts/ci directory selects nothing', () => {
  assert.deepEqual(findWorkflowScanningTests('/nonexistent-root'), []);
});

test('the repository security scanners are discovered and paused ones are not', () => {
  const found = findWorkflowScanningTests(ROOT);
  for (const scanner of [
    'scripts/ci/production-secret-scope.test.js',
    'scripts/ci/workflow-action-pins.test.js',
    'scripts/ci/workflow-script-injection.test.js',
    'scripts/ci/workflow-permissions.test.js',
  ]) {
    assert.ok(found.includes(scanner), scanner);
  }
  assert.ok(!found.includes('scripts/ci/rust-verification-workflow.test.js'));
});
