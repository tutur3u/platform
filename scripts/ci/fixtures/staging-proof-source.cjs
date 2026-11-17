const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const command = 'node scripts/ci/verify-staging-migration-marker.mjs';

function readStagingProof(workflow) {
  const commandIndex = workflow.indexOf(command);
  assert.ok(commandIndex >= 0, 'production workflow must invoke staging proof');
  assert.equal(
    workflow.indexOf(command, commandIndex + command.length),
    -1,
    'production workflow must invoke staging proof exactly once'
  );
  const evaluate = workflow
    .split('      - name: Evaluate prerequisite status\n')[1]
    ?.split('\n      - name:')[0];
  assert.ok(evaluate, 'production prerequisite evaluation must exist');
  const proofIndex = evaluate.indexOf(command);
  const deployIndex = evaluate.indexOf('SHOULD_DEPLOY=true');
  assert.ok(
    proofIndex >= 0 && deployIndex > proofIndex,
    'staging proof must succeed before migration eligibility'
  );
  const source = readFileSync(
    path.join(root, 'scripts/ci/verify-staging-migration-marker.mjs'),
    'utf8'
  );
  const boundary = source.indexOf('async function persistResult(');
  const main = source.indexOf('async function main()');
  assert.ok(
    main >= 0 && boundary > main,
    'staging proof entry point must exist'
  );
  assert.match(source.slice(boundary), /\nmain\(\)\s*\.then\(/);
  return { source, code: source.slice(0, boundary), command, commandIndex };
}

module.exports = { readStagingProof };
