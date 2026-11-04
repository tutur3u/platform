const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { evaluateExpression } = require('./github-expression-test-helper');

// Summary assertions can span steps; execute every applicable shell assertion
// with Actions' fail-fast behavior instead of assuming the first step is a gate.
function runWorkflowGate(job, env) {
  const scope = { needs: { changes: { outputs: { code: env.CODE } } } };
  const commands = job.steps
    .filter((step) => !step.if || evaluateExpression(step.if, scope))
    .map((step) => step.run);
  assert.ok(commands.length > 0, 'summary must contain shell assertions');
  assert.ok(
    commands.every((command) => typeof command === 'string' && command.trim())
  );
  return spawnSync(
    'bash',
    [
      '--noprofile',
      '--norc',
      '-e',
      '-o',
      'pipefail',
      '-c',
      commands.join('\n'),
    ],
    { env: { ...process.env, ...env }, encoding: 'utf8' }
  );
}

module.exports = { runWorkflowGate };
