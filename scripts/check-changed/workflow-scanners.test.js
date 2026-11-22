const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findWorkflowScanningTests } = require('./workflow-scanners');

const ROOT = path.resolve(__dirname, '../..');

test('finds the scripts/ci tests that call readAllWorkflows()', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-scanners-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
    const write = (name, body) =>
      fs.writeFileSync(path.join(dir, 'scripts/ci', name), body);
    write('secret-scope.test.js', 'const w = readAllWorkflows(undefined);');
    write('runner.test.mjs', 'readAllWorkflows ( dir )');
    write('single.test.js', "readWorkflow('one.yaml')");
    write('helper.js', 'readAllWorkflows()');
    assert.deepEqual(findWorkflowScanningTests(dir), [
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

test('the repository secret scope test is a workflow scanner', () => {
  assert.ok(
    findWorkflowScanningTests(ROOT).includes(
      'scripts/ci/production-secret-scope.test.js'
    )
  );
});
