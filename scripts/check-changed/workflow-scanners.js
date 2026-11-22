// Repository-wide workflow guards for the changed-files gate. A test under
// scripts/ci that inspects every workflow or composite action (secret scope,
// permissions, credentials, action pins, script injection, runner policy)
// can fail because of any workflow edit, not only its own sibling file, so the
// gate runs all of them whenever a workflow or composite action changes.
// Tests of paused runtimes stay excluded, as in the root script suite.

const fs = require('node:fs');
const path = require('node:path');
const { isPausedImplementationTest } = require('../paused-runtimes.js');

const SCANNER_DIRECTORY = 'scripts/ci';
const NODE_TEST_FILE = /\.test\.(?:c?js|mjs)$/;
// A test scans every workflow when it loads them all through the shared
// helper, lists the workflow or action directory itself, or loads one of the
// inventories that are built from every workflow. The directory signal is a
// deliberate co-occurrence heuristic: a test that calls readdirSync() on any
// directory and also names a workflow path is selected. It over-selects a few
// self-contained tests, which costs seconds; missing a scanner costs a red main.
const LOADS_EVERY_WORKFLOW = /\breadAllWorkflows\s*\(/;
const LISTS_DIRECTORY = /\breaddirSync\s*\(/;
const WORKFLOW_DIRECTORY =
  /\.github[/'"`\s,]+(?:workflows|actions)\b|\bworkflowsDir\b/;
const WORKFLOW_INVENTORY =
  /require\(\s*['"]\.\/(?:tuturuuu-bot-inventory|self-hosted-policy)(?:\.js)?['"]\s*\)/;

function scansEveryWorkflow(source) {
  return (
    LOADS_EVERY_WORKFLOW.test(source) ||
    (LISTS_DIRECTORY.test(source) && WORKFLOW_DIRECTORY.test(source)) ||
    WORKFLOW_INVENTORY.test(source)
  );
}

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
    .filter((file) => !isPausedImplementationTest(file))
    .filter((file) =>
      scansEveryWorkflow(fsImpl.readFileSync(path.join(root, file), 'utf8'))
    )
    .sort();
}

module.exports = { findWorkflowScanningTests, scansEveryWorkflow };
