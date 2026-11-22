// Repository-wide workflow guards for the changed-files gate. A test under
// scripts/ci that loads every workflow through readAllWorkflows() (secret
// scope, permissions, credentials, runner policy) can fail because of any
// workflow edit, not only its own sibling file, so the gate runs those tests
// whenever a workflow or composite action changes. Scanners that list the
// workflow directory themselves are not discovered here; the ones the gate
// needs are listed in plan.js WORKFLOW_POLICY_TESTS.

const fs = require('node:fs');
const path = require('node:path');

const SCANNER_DIRECTORY = 'scripts/ci';
const NODE_TEST_FILE = /\.test\.(?:c?js|mjs)$/;
const LOADS_EVERY_WORKFLOW = /\breadAllWorkflows\s*\(/;

function findWorkflowScanningTests(root, fsImpl = fs) {
  let entries;
  try {
    entries = fsImpl.readdirSync(path.join(root, SCANNER_DIRECTORY));
  } catch {
    return [];
  }
  return entries
    .filter((name) => NODE_TEST_FILE.test(name))
    .map((name) => `${SCANNER_DIRECTORY}/${name}`)
    .filter((file) =>
      LOADS_EVERY_WORKFLOW.test(
        fsImpl.readFileSync(path.join(root, file), 'utf8')
      )
    )
    .sort();
}

module.exports = { findWorkflowScanningTests };
