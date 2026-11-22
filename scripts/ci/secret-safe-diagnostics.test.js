const assert = require('node:assert/strict');
const test = require('node:test');
const {
  safeToolingFailure,
  ToolingDiagnosticError,
} = require('./secret-safe-diagnostics.js');

test('known tooling failures print the public instruction and omit the cause', () => {
  const error = new ToolingDiagnosticError(
    'deployment-active',
    'private command arguments',
    {
      cause: new Error('private subprocess output'),
    }
  );
  assert.match(
    safeToolingFailure(error, 'Web Docker command'),
    /Re-run with --cancel-active-build/
  );
  assert.doesNotMatch(
    safeToolingFailure(error, 'Web Docker command'),
    /private/
  );
});

test('unknown tooling failures print only the operation and a fixed exit category', () => {
  const error = Object.assign(new Error('private provider response'), {
    diagnostic: 'deployment-active',
    exitCode: 7,
    stderr: 'private stderr',
  });
  assert.equal(
    safeToolingFailure(error, 'Web Docker command'),
    'Web Docker command failed (nonzero exit).'
  );
  error.exitCode = 'private string';
  assert.equal(
    safeToolingFailure(error, 'Web Docker command'),
    'Web Docker command failed.'
  );
});
